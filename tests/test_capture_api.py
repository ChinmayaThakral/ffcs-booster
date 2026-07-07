"""End-to-end tests for POST /api/capture: dataset -> DB -> generator."""

import sys
import os
import uuid
import unittest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, db
from models import Course, Slot


def make_dataset(courses):
    return {
        'schemaVersion': 1,
        'campus': 'VIT_BHOPAL',
        'semesterLabel': 'WINTER SEMESTER 2025-26',
        'capturedAt': '2026-07-08T10:15:00+05:30',
        'sourceUrl': 'https://dev.vitbhopal.ac.in/WINTER%20SEMESTER%202025-26_ALL_registration/',
        'courses': courses,
    }


# Values hand-copied from courses/CSA3006.html (view-slots fixture)
CSA3006 = {
    'code': 'CSA3006',
    'title': 'DATA MINING AND DATA WAREHOUSING',
    'courseType': 'LTP',
    'credits': 4,
    'category': 'PC',
    'slotless': False,
    'ltpjc': {'l': 2, 't': 1, 'p': 1, 'j': 0, 'c': 4},
    'options': [
        {
            'id': 'csa3006|nilamadhab-mishra|a11+a12+a13',
            'slotCombo': ['A11', 'A12', 'A13'],
            'rawSlotText': 'A11+A12+A13',
            'venue': 'AB02-330',
            'faculty': 'NILAMADHAB MISHRA',
            'seats': 'Full',
            'totalSeats': 120,
            'slotStatus': 'Clashed with A11/ A12/ A13',
            'capturedAt': '2026-07-08T10:15:00+05:30',
            'unknownSlots': [],
        },
        {
            'id': 'csa3006|rizwan-ur-rahman|a14+d11+d12',
            'slotCombo': ['A14', 'D11', 'D12'],
            'rawSlotText': 'A14+D11+D12',
            'venue': 'LC-002',
            'faculty': 'RIZWAN UR RAHMAN',
            'seats': 91,
            'totalSeats': 120,
            'capturedAt': '2026-07-08T10:15:00+05:30',
            'unknownSlots': [],
        },
    ],
}

CSA3007 = {
    'code': 'CSA3007',
    'title': 'INFORMATION SECURITY',
    'courseType': 'LTP',
    'credits': 4,
    'category': 'PC',
    'options': [
        {
            'rawSlotText': 'B11+B12+B13',
            'slotCombo': ['B11', 'B12', 'B13'],
            'venue': 'AB02-331',
            'faculty': 'FACULTY ONE',
            'seats': 42,
        },
        {
            'rawSlotText': 'E11+E12+E13',
            'slotCombo': ['E11', 'E12', 'E13'],
            'venue': 'AB02-332',
            'faculty': 'FACULTY TWO',
            'seats': 'Full',
        },
    ],
}


class TestCaptureAPI(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.guest_id = f'test-guest-{uuid.uuid4()}'

        with self.client.session_transaction() as sess:
            sess['guest_id'] = self.guest_id

    def tearDown(self):
        with self.app.app_context():
            courses = Course.query.filter_by(guest_id=self.guest_id).all()
            for c in courses:
                db.session.delete(c)
            db.session.commit()

    def test_rejects_non_json(self):
        resp = self.client.post('/api/capture', data='not json', content_type='text/plain')
        self.assertEqual(resp.status_code, 400)

    def test_rejects_invalid_schema(self):
        resp = self.client.post('/api/capture', json={'schemaVersion': 1})
        self.assertEqual(resp.status_code, 400)
        self.assertIn('details', resp.get_json())

    def test_ingests_dataset_and_generates_timetables(self):
        resp = self.client.post('/api/capture', json=make_dataset([CSA3006, CSA3007]))
        self.assertEqual(resp.status_code, 200, resp.get_json())
        body = resp.get_json()
        self.assertEqual(body['summary']['courses_processed'], 2)
        self.assertEqual(body['summary']['options_added'], 4)

        with self.app.app_context():
            course = Course.query.filter_by(code='CSA3006', guest_id=self.guest_id).first()
            self.assertIsNotNone(course)
            self.assertEqual(course.c, 4)
            self.assertEqual(course.l, 2)

            slots = Slot.query.filter_by(course_id=course.id).all()
            self.assertEqual(len(slots), 2)
            by_code = {s.slot_code: s for s in slots}
            # "Full" maps to 0 available seats; totalSeats is respected
            self.assertEqual(by_code['A11+A12+A13'].available_seats, 0)
            self.assertEqual(by_code['A11+A12+A13'].total_seats, 120)
            self.assertEqual(by_code['A14+D11+D12'].available_seats, 91)

            course_ids = [
                str(c.id) for c in Course.query.filter_by(guest_id=self.guest_id).all()
            ]

        # The existing generator must produce clash-free timetables from captured data
        resp = self.client.post('/api/generate/suggest', json={'course_ids': course_ids, 'limit': 5})
        self.assertEqual(resp.status_code, 200, resp.get_json())
        suggestions = resp.get_json()['suggestions']
        self.assertGreater(len(suggestions), 0)
        for suggestion in suggestions:
            self.assertEqual(len(suggestion['slots']), 2)

    def test_recapture_is_idempotent(self):
        first = self.client.post('/api/capture', json=make_dataset([CSA3006]))
        self.assertEqual(first.status_code, 200)
        second = self.client.post('/api/capture', json=make_dataset([CSA3006]))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json()['summary']['options_added'], 0)

        with self.app.app_context():
            course = Course.query.filter_by(code='CSA3006', guest_id=self.guest_id).first()
            self.assertEqual(Slot.query.filter_by(course_id=course.id).count(), 2)

    def test_reports_unknown_slot_warnings(self):
        course = dict(CSA3006)
        course['options'] = [{
            'rawSlotText': 'A11+TC1',
            'slotCombo': ['A11', 'TC1'],
            'venue': 'AB-105',
            'faculty': 'SOME FACULTY',
            'seats': 10,
            'unknownSlots': ['TC1'],
        }]
        resp = self.client.post('/api/capture', json=make_dataset([course]))
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any('TC1' in w for w in resp.get_json()['warnings']))


if __name__ == '__main__':
    unittest.main()
