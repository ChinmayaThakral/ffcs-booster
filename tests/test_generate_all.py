"""Tests for POST /api/generate/all: exhaustive, seat-safe enumeration."""

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
        'courses': courses,
    }


# CourseA has one open option (A11, MON P1) and one full option (A12, WED P1).
# CourseB has a single open option (B11, MON P2) that never clashes with either.
COURSE_A = {
    'code': 'TESTA001',
    'title': 'TEST COURSE A',
    'courseType': 'LTP',
    'credits': 4,
    'options': [
        {'rawSlotText': 'A11', 'venue': 'AB1', 'faculty': 'PROF OPEN', 'seats': 10},
        {'rawSlotText': 'A12', 'venue': 'AB2', 'faculty': 'PROF FULL', 'seats': 'Full'},
    ],
}
COURSE_B = {
    'code': 'TESTB002',
    'title': 'TEST COURSE B',
    'courseType': 'LTP',
    'credits': 3,
    'options': [
        {'rawSlotText': 'B11', 'venue': 'AB3', 'faculty': 'PROF B', 'seats': 5},
    ],
}


class TestGenerateAll(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.guest_id = f'test-guest-{uuid.uuid4()}'

        with self.client.session_transaction() as sess:
            sess['guest_id'] = self.guest_id

        resp = self.client.post('/api/capture', json=make_dataset([COURSE_A, COURSE_B]))
        assert resp.status_code == 200, resp.get_json()

        with self.app.app_context():
            self.course_ids = [
                str(c.id) for c in Course.query.filter_by(guest_id=self.guest_id).all()
            ]
            self.full_slot_id = Slot.query.filter_by(slot_code='A12').first().id

    def tearDown(self):
        with self.app.app_context():
            for c in Course.query.filter_by(guest_id=self.guest_id).all():
                db.session.delete(c)
            db.session.commit()

    def test_excludes_full_seats_by_default(self):
        resp = self.client.post('/api/generate/all', json={'course_ids': self.course_ids})
        self.assertEqual(resp.status_code, 200, resp.get_json())
        body = resp.get_json()

        # Only one valid combination once the Full option is dropped: A11 + B11
        self.assertEqual(body['total_enumerated'], 1)
        self.assertEqual(body['count'], 1)
        self.assertFalse(body['capped'])

        returned_slot_ids = {s['slot_id'] for sol in body['suggestions'] for s in sol['slots']}
        self.assertNotIn(str(self.full_slot_id), returned_slot_ids)

    def test_includes_full_seats_when_explicitly_disabled(self):
        resp = self.client.post('/api/generate/all', json={
            'course_ids': self.course_ids,
            'preferences': {'exclude_full_seats': False},
        })
        self.assertEqual(resp.status_code, 200, resp.get_json())
        body = resp.get_json()

        # Both A11+B11 and A12+B11 are valid combinations (different days, no clash)
        self.assertEqual(body['total_enumerated'], 2)
        returned_slot_ids = {s['slot_id'] for sol in body['suggestions'] for s in sol['slots']}
        self.assertIn(str(self.full_slot_id), returned_slot_ids)

    def test_requires_course_ids(self):
        resp = self.client.post('/api/generate/all', json={'course_ids': []})
        self.assertEqual(resp.status_code, 400)

    def test_requires_active_session(self):
        with self.client.session_transaction() as sess:
            sess.pop('guest_id', None)
            sess.pop('user_id', None)
        resp = self.client.post('/api/generate/all', json={'course_ids': self.course_ids})
        self.assertEqual(resp.status_code, 401)


if __name__ == '__main__':
    unittest.main()
