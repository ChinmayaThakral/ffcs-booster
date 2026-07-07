"""Validation and mapping for CaptureDataset payloads (extension -> backend)."""

import json
import os

import jsonschema

_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'schemas', 'capture-dataset.v1.json'
)

with open(_SCHEMA_PATH, encoding='utf-8') as f:
    CAPTURE_SCHEMA = json.load(f)

_validator = jsonschema.Draft202012Validator(CAPTURE_SCHEMA)


def validate_capture_dataset(data):
    """
    Validate a payload against the CaptureDataset v1 schema.

    Returns a list of error strings (empty when valid).
    """
    errors = []
    for err in _validator.iter_errors(data):
        path = '.'.join(str(p) for p in err.absolute_path) or '<root>'
        errors.append(f"{path}: {err.message}")
    return errors


def dataset_to_course_payloads(dataset):
    """
    Map a validated CaptureDataset to (course_data, slots_data) pairs
    matching the shapes consumed by utils.ingest.save_course_data.
    """
    payloads = []
    for course in dataset.get('courses', []):
        ltpjc = course.get('ltpjc') or {}
        course_data = {
            'code': course['code'],
            'name': course['title'],
            'l': ltpjc.get('l', 0),
            't': ltpjc.get('t', 0),
            'p': ltpjc.get('p', 0),
            'j': ltpjc.get('j', 0),
            'c': ltpjc.get('c', course.get('credits', 0)),
            'course_type': course.get('courseType', ''),
            'category': course.get('category', ''),
        }

        slots_data = []
        for option in course.get('options', []):
            seats = option['seats']
            slots_data.append({
                'slot_code': option['rawSlotText'],
                'venue': option.get('venue', ''),
                'faculty': option['faculty'],
                'available_seats': 0 if seats == 'Full' else int(seats),
                'total_seats': option.get('totalSeats'),
                'class_nbr': None,
            })

        payloads.append((course_data, slots_data))
    return payloads
