from flask import Flask, jsonify, request
app = Flask(__name__)
app.json.ensure_ascii = False
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024

@app.get('/api/health')
def health():
    return jsonify(status='ok', student_id='2024030', name='박용빈')

@app.errorhandler(413)
def too_large(error):
    return jsonify(error='입력 내용이 너무 큽니다.'), 413


from io import BytesIO
from pathlib import Path
import os
import sqlite3
from flask import send_file

DATA_DIR = Path(os.environ.get('DATA_DIR', '/data'))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / 'views.db'
DOSES = ['2.5', '5', '7.5', '10', '12.5', '15']
AREAS = ['신주쿠', '시부야', '긴자', '우에노', '이케부쿠로']
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS page_views (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL)')
    db.execute('INSERT OR IGNORE INTO page_views VALUES (1, 0)')
    db.execute('CREATE TABLE IF NOT EXISTS slots (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, capacity INTEGER NOT NULL, price INTEGER NOT NULL, area TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS reservations (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER NOT NULL, nickname TEXT NOT NULL, dose TEXT NOT NULL)')

@app.route('/api/views', methods=['GET', 'POST'])
def views():
    # UPDATE를 DB에서 수행하여 동시 요청으로 증가분이 사라지는 것을 막습니다.
    with sqlite3.connect(DB, timeout=10) as db:
        if request.method == 'POST':
            db.execute('UPDATE page_views SET count=count+1 WHERE id=1')
        count = db.execute('SELECT count FROM page_views WHERE id=1').fetchone()[0]
    return jsonify(views=count)

@app.route('/api/slots', methods=['GET', 'POST'])
def slots():
    # POST면 병원을 등록하고, 항상 병원 목록(예약된 수 포함)을 돌려줍니다.
    with sqlite3.connect(DB, timeout=10) as db:
        if request.method == 'POST':
            data = request.get_json(silent=True) or {}
            name = str(data.get('name', '')).strip()
            capacity = data.get('capacity')
            price = data.get('price')
            area = data.get('area')
            if not name or not isinstance(capacity, int) or capacity < 1:
                return jsonify(error='병원 이름과 1명 이상의 정원을 입력하세요.'), 400
            if not isinstance(price, int) or price < 1:
                return jsonify(error='가격을 1엔 이상으로 입력하세요.'), 400
            if area not in AREAS:
                return jsonify(error='지역을 선택하세요.'), 400
            if db.execute('SELECT 1 FROM slots WHERE area=?', (area,)).fetchone():
                return jsonify(error='이 지역에는 이미 병원이 등록되어 있습니다.'), 409
            db.execute('INSERT INTO slots (name, capacity, price, area) VALUES (?, ?, ?, ?)', (name, capacity, price, area))
        rows = db.execute('SELECT id, name, capacity, price, area, (SELECT COUNT(*) FROM reservations WHERE slot_id=slots.id) FROM slots').fetchall()
    return jsonify(slots=[{'id': r[0], 'name': r[1], 'capacity': r[2], 'price': r[3], 'area': r[4], 'booked': r[5]} for r in rows])

@app.route('/api/slots/<int:slot_id>/reservations', methods=['GET', 'POST'])
def reservations(slot_id):
    with sqlite3.connect(DB, timeout=10) as db:
        slot = db.execute('SELECT capacity FROM slots WHERE id=?', (slot_id,)).fetchone()
        if slot is None:
            return jsonify(error='없는 병원입니다.'), 404
        if request.method == 'POST':
            data = request.get_json(silent=True) or {}
            nickname = str(data.get('nickname', '')).strip()
            if not nickname:
                return jsonify(error='예약자 성함을 입력하세요.'), 400
            dose = str(data.get('dose', ''))
            if dose not in DOSES:
                return jsonify(error='용량을 선택하세요.'), 400
            if db.execute('SELECT 1 FROM reservations WHERE slot_id=? AND nickname=?', (slot_id, nickname)).fetchone():
                return jsonify(error='이미 예약한 예약자입니다.'), 409
            done = db.execute('INSERT INTO reservations (slot_id, nickname, dose) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM reservations WHERE slot_id=?) < ?', (slot_id, nickname, dose, slot_id, slot[0]))
            if done.rowcount == 0:
                return jsonify(error='예약이 마감되었습니다.'), 409
        rows = db.execute('SELECT nickname, dose FROM reservations WHERE slot_id=? ORDER BY id', (slot_id,)).fetchall()
    names = [f'{r[0]} ({r[1]}mg)' for r in rows]
    return jsonify(capacity=slot[0], remaining=slot[0] - len(names), nicknames=names)  

def bullets(value):
    # 화면 목록(li)은 innerText에서 줄 단위로 오므로 Markdown 목록으로 바꿉니다.
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    return '\n'.join(line if line.startswith('- ') else f'- {line}' for line in lines)

@app.post('/api/download')
def download():
    data = request.get_json(silent=True)
    fields = ['title', 'summary', 'features', 'technology']
    if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k].strip() for k in fields):
        return jsonify(error='프로젝트명·소개·주요 기능·사용 기술을 모두 작성하세요.'), 400
    optional = {k: data.get(k) if isinstance(data.get(k), str) else '' for k in ['tagline', 'details']}
    if any(len(v) > 5000 for v in [*(data[k] for k in fields), *optional.values()]):
        return jsonify(error='각 항목은 5,000자 이내로 작성하세요.'), 400
    text = f"# {data['title'].strip()}\n\n"
    if optional['tagline'].strip():
        text += f"> {optional['tagline'].strip()}\n\n"
    text += (f"## 프로젝트 소개\n{data['summary'].strip()}\n\n"
             f"## 주요 기능\n{bullets(data['features'])}\n\n"
             f"## 사용 기술\n{bullets(data['technology'])}\n")
    if optional['details'].strip():
        text += f"\n## 팀 소개 · 프로젝트 정보\n{bullets(optional['details'])}\n"
    return send_file(BytesIO(text.encode('utf-8')), as_attachment=True,
                     download_name='project-intro.md', mimetype='text/markdown; charset=utf-8')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)