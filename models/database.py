from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def init_app(app):
    db.init_app(app)
    # Import models to register them with SQLAlchemy
    from .course import Course
    from .faculty import Faculty
    from .slot import Slot
    from .registration import Registration
    from .user import User
    from .feedback import Feedback
