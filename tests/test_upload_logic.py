"""Tests for the shared upload/capture persistence logic (utils.ingest.save_course_data)."""

import sys
import os
import uuid
import unittest

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app, db
from models import Course, Slot, Faculty, User
from utils.ingest import save_course_data


class TestSaveCourseData(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.app.config['TESTING'] = True
        self.uid = str(uuid.uuid4())[:8]
        self.existing_fac_name = f"Prof. Existing {self.uid}"
        self.new_fac_name = f"Prof. New {self.uid}"
        self.course_code = f"TOPT{self.uid[:4].upper()}"

        with self.app.app_context():
            self.user = User(
                google_id=f"test_opt_user_{self.uid}",
                email=f"opt_{self.uid}@test.com",
                name="Opt User"
            )
            db.session.add(self.user)
            db.session.flush()
            self.user_id = self.user.id

            course = Course(
                code=self.course_code, name="Test Optimization",
                l=0, t=0, p=0, j=0, c=4,
                course_type="Theory", category="Core",
                user_id=self.user_id
            )
            db.session.add(course)
            db.session.flush()
            self.course_id = course.id

            ex_fac = Faculty(name=self.existing_fac_name)
            db.session.add(ex_fac)
            db.session.flush()

            # Pre-existing slot: A1+A2
            db.session.add(Slot(
                slot_code="A1+A2", course_id=course.id, faculty_id=ex_fac.id,
                venue="AB1", available_seats=10, total_seats=70
            ))
            db.session.commit()

    def tearDown(self):
        with self.app.app_context():
            course = db.session.get(Course, self.course_id)
            if course:
                db.session.delete(course)
            for name in (self.existing_fac_name, self.new_fac_name):
                fac = Faculty.query.filter_by(name=name).first()
                if fac:
                    db.session.delete(fac)
            user = db.session.get(User, self.user_id)
            if user:
                db.session.delete(user)
            db.session.commit()

    def test_dedupes_slots_and_reuses_faculties(self):
        course_data = {
            'code': self.course_code, 'name': "Test Optimization",
            'l': 0, 't': 0, 'p': 0, 'j': 0, 'c': 4,
            'course_type': "Theory", 'category': "Core",
        }
        # A1+A2 exists in DB (skip), B1+B2 is new (add once despite duplicate row),
        # C1+C2 is new with an already-known faculty (add, reuse faculty)
        parsed_slots = [
            {'slot_code': "A1+A2", 'venue': "AB1", 'faculty': self.existing_fac_name, 'available_seats': 10},
            {'slot_code': "B1+B2", 'venue': "AB2", 'faculty': self.new_fac_name, 'available_seats': 20},
            {'slot_code': "B1+B2", 'venue': "AB2", 'faculty': self.new_fac_name, 'available_seats': 20},
            {'slot_code': "C1+C2", 'venue': "AB3", 'faculty': self.existing_fac_name, 'available_seats': 30},
        ]

        with self.app.app_context():
            course, slots_added = save_course_data(course_data, parsed_slots, self.user_id, None)
            db.session.commit()

            self.assertEqual(course.id, self.course_id)  # matched existing course, no duplicate
            self.assertEqual(slots_added, 2)

            final_slots = Slot.query.filter_by(course_id=self.course_id).all()
            self.assertEqual(
                sorted(s.slot_code for s in final_slots),
                ['A1+A2', 'B1+B2', 'C1+C2']
            )

            self.assertIsNotNone(Faculty.query.filter_by(name=self.new_fac_name).first())
            self.assertEqual(Faculty.query.filter_by(name=self.existing_fac_name).count(), 1)


if __name__ == "__main__":
    unittest.main()
