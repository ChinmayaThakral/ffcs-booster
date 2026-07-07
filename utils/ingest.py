"""Shared persistence for course/slot data coming from any import path (HTML upload, CSV, capture API)."""

from models import db, Course, Faculty, Slot


def save_course_data(course_data, slots_data, user_id, guest_id):
    """
    Upsert a course and its option rows for the given owner scope.

    Args:
        course_data: dict with keys code, name, l, t, p, j, c, course_type, category
        slots_data: list of dicts with keys slot_code, venue, faculty, available_seats,
                    and optionally total_seats, class_nbr
        user_id/guest_id: owner scope (exactly one should be set)

    Returns:
        (course, slots_added) — does not commit; caller controls the transaction.
    """
    code_upper = course_data['code'].upper()
    query = Course.query.filter_by(code=code_upper)
    if user_id:
        query = query.filter_by(user_id=user_id)
    else:
        query = query.filter_by(guest_id=guest_id)

    course = query.first()

    if not course:
        course = Course(
            code=code_upper,
            name=course_data['name'],
            l=course_data.get('l', 0),
            t=course_data.get('t', 0),
            p=course_data.get('p', 0),
            j=course_data.get('j', 0),
            c=course_data.get('c', 0),
            course_type=course_data.get('course_type', ''),
            category=course_data.get('category', ''),
            user_id=user_id,
            guest_id=guest_id
        )
        db.session.add(course)
        db.session.flush()

    # Faculties are global, deduped by name
    faculty_names = set(s['faculty'] for s in slots_data if s['faculty'])

    existing_faculties = Faculty.query.filter(Faculty.name.in_(faculty_names)).all() if faculty_names else []
    faculty_map = {f.name: f for f in existing_faculties}

    missing_names = faculty_names - set(faculty_map.keys())
    if missing_names:
        new_facs = [Faculty(name=name) for name in missing_names]
        db.session.add_all(new_facs)
        db.session.flush()
        for f in new_facs:
            faculty_map[f.name] = f

    # Slots deduped per-course by (slot_code, venue)
    existing_slots = Slot.query.filter_by(course_id=course.id).all()
    existing_slot_signatures = {(s.slot_code, s.venue) for s in existing_slots}

    slots_to_add = []
    for slot_data in slots_data:
        signature = (slot_data['slot_code'], slot_data['venue'])
        if signature in existing_slot_signatures:
            continue

        faculty = faculty_map.get(slot_data['faculty'])
        slots_to_add.append(Slot(
            slot_code=slot_data['slot_code'],
            course_id=course.id,
            faculty_id=faculty.id if faculty else None,
            venue=slot_data['venue'],
            available_seats=slot_data['available_seats'],
            total_seats=slot_data.get('total_seats') or 70,
            class_nbr=slot_data.get('class_nbr')
        ))
        existing_slot_signatures.add(signature)

    if slots_to_add:
        db.session.add_all(slots_to_add)

    return course, len(slots_to_add)
