
import re
import os

path = r'd:\PAPERS\application\assign\ffcs\templates\components\timetable_grid.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern explanation:
# 1. Matches start of if block + invalid whitespace + <div class="slot-content">
# 2. Captures <span class="course-code"... part (which means slot-code is missing before it)
# 3. Matches rest until {% else %}
# 4. Captures the slot code from inside <div class="slot-empty">CODE</div> using regex [A-Z0-9+]+
# 5. Matches end if
pattern = re.compile(
    r'(% if slot_info %}<div class="slot-content">)\s*(<span class="course-code".*?)(% else %}<div\s+class="slot-empty">([A-Z0-9\+]+)</div>{% endif %})',
    re.DOTALL
)

count = 0
def repl(m):
    global count
    count += 1
    prefix = m.group(1)   # {% if slot_info %}<div class="slot-content">
    body = m.group(2)     # <span class="course-code" ...
    suffix = m.group(3)   # {% else %}...{% endif %}
    slot_code = m.group(4) # A11, B12+B22, etc.
    
    # We construct the new string inserting the slot code span
    return f'{prefix}<span class="slot-code">{slot_code}</span><br>{body}{suffix}'

new_content = re.sub(pattern, repl, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Updated {count} cells.")
