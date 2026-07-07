"""Routes for HTML/CSV file upload and parsing."""

from flask import Blueprint, request, jsonify, session, Response
from models import db, Course, Faculty, Slot
from utils.html_parser import parse_vtop_html
from utils.csv_parser import parse_course_csv
from utils.ingest import save_course_data

upload_bp = Blueprint('upload', __name__)


@upload_bp.route('/csv-template', methods=['GET'])
def download_csv_template():
    """
    Download a CSV template file for course data import.
    Format: Course details header + data, then slot details header + data rows.
    """
    csv_content = """course_code,course_name,l,t,p,j,c,course_type,category
CSA3006,DATA MINING,2,1,1,0,4,LTP,PC
slot_code,faculty,venue,available_seats
A11+A12+A13,NILAMADHAB MISHRA,AB02-330,0
B14+B23+D21,JASMINE SELVAKUMARI JEYA,AR-002,14
C11+C12+TC1,ANOTHER FACULTY,AB-105,25
"""
    
    return Response(
        csv_content,
        mimetype='text/csv',
        headers={
            'Content-Disposition': 'attachment; filename=course_template.csv'
        }
    )
@upload_bp.route('/parse', methods=['POST'])
def parse_html_file():
    """
    Parse uploaded HTML file and extract course/slot information.
    Returns parsed data without saving to database.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith(('.html', '.htm', '.mhtml')):
        return jsonify({'error': 'File must be HTML or MHTML'}), 400
    
    try:
        html_content = file.read().decode('utf-8')
        parsed = parse_vtop_html(html_content)
        
        if not parsed['course']:
            return jsonify({'error': 'Could not parse course information from HTML'}), 400
        
        return jsonify({
            'success': True,
            'course': parsed['course'],
            'slots': parsed['slots'],
            'slot_count': len(parsed['slots'])
        })
        
    except Exception as e:
        return jsonify({'error': f'Error parsing file: {str(e)}'}), 500

@upload_bp.route('/parse-batch', methods=['POST'])
def parse_html_batch():
    """
    Parse uploaded HTML files in batch and extract course/slot information.
    """
    files = request.files.getlist('files[]')
    
    if not files:
        return jsonify({'error': 'No files provided'}), 400
    
    results = []
    for file in files:
        if file.filename == '':
            continue
            
        if not file.filename.lower().endswith(('.html', '.htm', '.mhtml')):
            results.append({'filename': file.filename, 'status': 'error', 'error': 'File must be HTML or MHTML'})
            continue
            
        try:
            html_content = file.read().decode('utf-8')
            parsed = parse_vtop_html(html_content)
            
            if not parsed['course']:
                results.append({'filename': file.filename, 'status': 'error', 'error': 'Could not parse course info'})
            else:
                results.append({
                    'filename': file.filename,
                    'status': 'success',
                    'course': parsed['course'],
                    'slot_count': len(parsed['slots'])
                })
        except Exception as e:
            results.append({'filename': file.filename, 'status': 'error', 'error': str(e)})

    return jsonify({'results': results})

@upload_bp.route('/import', methods=['POST'])
def import_html_file():
    """
    Parse uploaded HTML files and save data to database.
    Accepts multiple files key 'files[]'.
    """
    files = request.files.getlist('files[]')
    
    if not files:
        # Fallback for single file 'file' logic if needed, or just error
        if 'file' in request.files:
            files = [request.files['file']]
        else:
            return jsonify({'error': 'No files provided'}), 400
    
    # Determine owner
    user_id = session.get('user_id')
    guest_id = session.get('guest_id')
    
    if not user_id and not guest_id:
        return jsonify({'error': 'No active session'}), 401

    results = []
    success_count = 0
    
    for file in files:
        if file.filename == '':
            continue
            
        if not file.filename.lower().endswith(('.html', '.htm', '.mhtml', '.csv')):
            results.append({
                'filename': file.filename,
                'status': 'error',
                'message': 'Invalid file type. Supported: HTML, MHTML, CSV'
            })
            continue

        try:
            # Process single file
            result = _process_single_file_import(file, user_id, guest_id)
            results.append(result)
            if result['status'] == 'success':
                success_count += 1
                
        except Exception as e:
            # DB Rollback handled inside helper or here if transaction spans whole loop?
            # We want partial success, so _process_single_file_import should handle its own transaction lifecycle 
            # OR we handle it here. 
            # If we want to isolate errors, we should commit/rollback per file.
            db.session.rollback() 
            results.append({
                'filename': file.filename,
                'status': 'error',
                'message': str(e)
            })

    return jsonify({
        'success': True,
        'summary': f'Processed {len(files)} files. {success_count} succeeded.',
        'results': results,
        'success_count': success_count
    })

def _process_single_file_import(file, user_id, guest_id):
    """Helper to process a single file import within the batch."""
    try:
        file_content = file.read().decode('utf-8')
        
        # Route to appropriate parser based on file extension
        if file.filename.lower().endswith('.csv'):
            parsed = parse_course_csv(file_content)
        else:
            parsed = parse_vtop_html(file_content)
        
        if not parsed['course']:
            return {'filename': file.filename, 'status': 'error', 'message': 'Could not parse course info'}

        course_data = parsed['course']

        course, slots_added = save_course_data(course_data, parsed['slots'], user_id, guest_id)

        # Commit per file to avoid huge transactions and ensure partial batch success
        db.session.commit()
        
        return {
            'filename': file.filename,
            'status': 'success',
            'course_code': course_data['code'],
            'slots_added': slots_added
        }
        
    except Exception as e:
        db.session.rollback()
        raise e # Re-raise to be caught by the loop handler
