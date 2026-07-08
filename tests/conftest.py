import os
import sys

# Make the repo root importable (app, models, utils) regardless of how pytest is invoked
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
