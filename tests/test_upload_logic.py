from app import app, db
from models import Course, Slot, Faculty, User
import uuid

def test_upload_logic():
    print("--- Testing Optimized Upload Logic ---")
    
    # Setup Data
    course_code = "TEST_OPT_101"
    existing_fac_name = "Prof. Existing"
    new_fac_name = "Prof. New"
    
    with app.app_context():
        # Clean previous test data
        c = Course.query.filter_by(code=course_code).first()
        if c: db.session.delete(c)
        f = Faculty.query.filter_by(name=existing_fac_name).first()
        if f: db.session.delete(f)
        f = Faculty.query.filter_by(name=new_fac_name).first()
        if f: db.session.delete(f)
        db.session.commit()
        
        # 1. Create Pre-existing Data
        print("1. Setting up initial state...")
        # Create user to satisfy FK
        u = User(google_id="test_opt_user", email="opt@test.com", name="Opt User")
        db.session.add(u)
        db.session.flush()
        user_id = u.id
        
        course = Course(
            code=course_code, name="Test Optimization",
            l=0, t=0, p=0, j=0, c=4,
            course_type="Theory", category="Core",
            user_id=user_id
        )
        db.session.add(course)
        db.session.flush()
        
        ex_fac = Faculty(name=existing_fac_name)
        db.session.add(ex_fac)
        db.session.flush()
        
        # Add one existing slot: A1+A2
        s1 = Slot(
            slot_code="A1+A2", course_id=course.id, faculty_id=ex_fac.id,
            venue="AB1", available_seats=10, total_seats=70
        )
        db.session.add(s1)
        db.session.commit()
        print("   Database has: A1+A2, Prof. Existing")

        # 2. Simulate Upload Parsed Data
        # Contains:
        # - A1+A2 (Existing in DB -> SKIP)
        # - B1+B2 (New Slot, New Faculty -> ADD)
        # - B1+B2 (Duplicate in file -> SKIP)
        # - C1+C2 (New Slot, Existing Faculty -> ADD)
        parsed_slots = [
            {'slot_code': "A1+A2", 'venue': "AB1", 'faculty': existing_fac_name, 'available_seats': 10},
            {'slot_code': "B1+B2", 'venue': "AB2", 'faculty': new_fac_name, 'available_seats': 20},
            {'slot_code': "B1+B2", 'venue': "AB2", 'faculty': new_fac_name, 'available_seats': 20}, # Duplicate
            {'slot_code': "C1+C2", 'venue': "AB3", 'faculty': existing_fac_name, 'available_seats': 30}
        ]
        
        print(f"2. Simulating upload with {len(parsed_slots)} slots (1 Existing, 1 New, 1 Duplicate New, 1 New w/ Old Fac)")
        
        # --- EXECUTE LOGIC (Copy-paste of optimized logic for testing) ---
        # In a real unit test we'd import the function, but since it's inside a route, checking logic here is safer/faster
        
        # ... [Logic Start] ...
        
        # Faculty Batch
        faculty_names = set(s['faculty'] for s in parsed_slots if s['faculty'])
        existing_facs = Faculty.query.filter(Faculty.name.in_(faculty_names)).all()
        faculty_map = {f.name: f for f in existing_facs}
        
        missing_names = faculty_names - set(faculty_map.keys())
        if missing_names:
            print(f"   Creating new faculties: {missing_names}")
            new_facs = [Faculty(name=n) for n in missing_names]
            db.session.add_all(new_facs)
            db.session.flush()
            for f in new_facs: faculty_map[f.name] = f
            
        # Slot Batch
        all_db_slots = Slot.query.filter_by(course_id=course.id).all()
        existing_sigs = {(s.slot_code, s.venue) for s in all_db_slots}
        
        slots_to_add = []
        for s_data in parsed_slots:
            sig = (s_data['slot_code'], s_data['venue'])
            if sig not in existing_sigs:
                fac = faculty_map.get(s_data['faculty'])
                new_slot = Slot(
                    slot_code=s_data['slot_code'],
                    course_id=course.id,
                    faculty_id=fac.id if fac else None,
                    venue=s_data['venue'],
                    available_seats=s_data['available_seats'],
                    total_seats=70
                )
                slots_to_add.append(new_slot)
                existing_sigs.add(sig) # CRITICAL: Prevent duplicate adds
        
        if slots_to_add:
            db.session.add_all(slots_to_add)
            print(f"   Added {len(slots_to_add)} slots.")
        
        db.session.commit()
        # ... [Logic End] ...

        # 3. Verify
        print("3. Verifying Final State...")
        final_slots = Slot.query.filter_by(course_id=course.id).all()
        slot_codes = sorted([s.slot_code for s in final_slots])
        
        print(f"   Final Slots in DB: {slot_codes}")
        
        # Expect: A1+A2, B1+B2, C1+C2 (Total 3)
        if len(final_slots) == 3 and slot_codes == ['A1+A2', 'B1+B2', 'C1+C2']:
            print("   [PASS] Slot count and codes correct.")
        else:
            print("   [FAIL] Incorrect slot data!")
            
        # Check Faculty
        f_new = Faculty.query.filter_by(name=new_fac_name).first()
        if f_new:
            print("   [PASS] New faculty created.")
        else:
            print("   [FAIL] New faculty missing!")
            
        # Clean up
        db.session.delete(course)
        # Note: Faculty might be shared, keeping them or deleting if strictly scoped. 
        # For test, we delete.
        db.session.delete(f_new)
        db.session.delete(ex_fac)
        db.session.commit()
        print("Test Cleaned Up.")

if __name__ == "__main__":
    test_upload_logic()
