from datetime import datetime
from .database import db

class Rating(db.Model):
    """Model for storing user star ratings (1-5) for the web app."""
    __tablename__ = 'ratings'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    guest_id = db.Column(db.String(50), nullable=True)
    stars = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship to user
    user = db.relationship('User', backref=db.backref('ratings', lazy=True))

    def __repr__(self):
        return f'<Rating {self.id}: {self.stars} stars>'
