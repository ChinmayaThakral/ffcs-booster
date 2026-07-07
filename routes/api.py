"""JSON capture API — ingestion endpoint for the browser extension."""

import uuid

from flask import Blueprint, jsonify, request, session

from models import db
from utils.capture import dataset_to_course_payloads, validate_capture_dataset
from utils.ingest import save_course_data

api_bp = Blueprint('api', __name__)


@api_bp.after_request
def add_cors_headers(response):
    """The extension posts from its own origin; allow it (no cookies are exposed cross-origin)."""
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response


@api_bp.route('/capture', methods=['OPTIONS'])
def capture_preflight():
    return ('', 204)


@api_bp.route('/capture', methods=['POST'])
def capture():
    """
    Ingest a CaptureDataset (schemas/capture-dataset.v1.json) into the same
    models the HTML upload path populates.
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Request body must be JSON'}), 400

    errors = validate_capture_dataset(data)
    if errors:
        return jsonify({'error': 'Schema validation failed', 'details': errors[:20]}), 400

    user_id = session.get('user_id')
    guest_id = session.get('guest_id')
    if not user_id and not guest_id:
        guest_id = str(uuid.uuid4())
        session['guest_id'] = guest_id

    results = []
    warnings = []
    courses_processed = 0
    options_added = 0

    for course_data, slots_data in dataset_to_course_payloads(data):
        try:
            course, slots_added = save_course_data(course_data, slots_data, user_id, guest_id)
            db.session.commit()
            courses_processed += 1
            options_added += slots_added
            results.append({
                'course_code': course.code,
                'status': 'success',
                'options_added': slots_added,
                'options_skipped': len(slots_data) - slots_added
            })
        except Exception as e:
            db.session.rollback()
            results.append({
                'course_code': course_data.get('code', '?'),
                'status': 'error',
                'message': str(e)
            })

    for course in data.get('courses', []):
        for option in course.get('options', []):
            unknown = option.get('unknownSlots') or []
            if unknown:
                warnings.append(
                    f"{course['code']}: option '{option['rawSlotText']}' has unknown slot codes {unknown}"
                )

    return jsonify({
        'success': True,
        'semester': data['semesterLabel'],
        'summary': {
            'courses_processed': courses_processed,
            'options_added': options_added
        },
        'results': results,
        'warnings': warnings
    })
