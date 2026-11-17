// 화면의 칸·버튼을 id로 찾고, /api/ 주소로 요청을 보냅니다.
const $ = id => document.getElementById(id);
const msg = $('slot-message');
const yen = amount => '¥' + amount.toLocaleString('ja-JP');
// 지역마다 지도에서의 위치(왼쪽 %, 위쪽 %)를 정해 둡니다.
const SPOTS = {'신주쿠': [27, 34], '시부야': [20, 72], '긴자': [70, 70], '우에노': [78, 30], '이케부쿠로': [50, 16]};
let selected = null;   // 지도에서 고른 병원 번호
// 토스트 알림: 글자를 넣고 보여준 뒤 3초 후에 숨깁니다.
let toastTimer;
function notify(text, isError = false) {
  msg.textContent = text;
  msg.classList.toggle('error', isError);
  msg.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => msg.classList.remove('show'), 3000);
}

// body가 있으면 POST(등록·예약), 없으면 GET(조회)으로 보냅니다.
async function api(url, body) {
  const options = body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {};
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

// 병원 목록을 받아 지도에 핀으로 그립니다.
async function loadSlots() {
  const data = await api('/api/slots');
  $('map').replaceChildren();
  for (const slot of data.slots) {
    const full = slot.booked >= slot.capacity;
    const pin = document.createElement('button');
    pin.className = 'pin' + (full ? ' full' : '') + (slot.id === selected ? ' selected' : '');
    pin.style.left = SPOTS[slot.area][0] + '%';
    pin.style.top = SPOTS[slot.area][1] + '%';
    const name = document.createElement('strong');
    name.textContent = `${slot.name} · ${slot.area}`;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = yen(slot.price);
    const count = document.createElement('span');
    count.textContent = full ? '예약 마감' : `예약 ${slot.booked}/${slot.capacity}`;
    const bar = document.createElement('span');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = (slot.booked / slot.capacity * 100) + '%';
    bar.append(fill);
    pin.append(name, price, count, bar);
    pin.addEventListener('click', () => {
      selected = slot.id;
      // 병원을 고른 뒤에만 성함·용량 입력과 예약 버튼을 쓸 수 있게 잠금을 풉니다.
      for (const id of ['nickname', 'dose', 'reserve']) $(id).disabled = false;
      $('picked').textContent = `${slot.name} (${slot.area}) · 1회 상담 ${yen(slot.price)}`;
      loadSlots();
      refresh();
    });
    $('map').append(pin);
  }
}

// 정원·남은 자리·예약자 명단을 화면에 그립니다.
function showStatus(data) {
  $('status').textContent = `정원 ${data.capacity}명 · 남은 자리 ${data.remaining}명`;
  $('status-list').innerHTML = '';
  for (const name of data.nicknames) {
    const item = document.createElement('li');
    item.textContent = name;
    $('status-list').append(item);
  }
}

async function loadStatus() {
  const id = selected;
  if (!id) { $('status').textContent = '지도에서 병원을 선택하세요.'; return; }
  showStatus(await api(`/api/slots/${id}/reservations`));
}

// 기능: 병원 등록
$('slot-add').addEventListener('click', async () => {
  try {
    await api('/api/slots', {name: $('slot-name').value, capacity: Number($('slot-capacity').value), price: Number($('slot-price').value), area: $('slot-area').value});
    $('slot-name').value = '';
    $('slot-capacity').value = '';
    $('slot-price').value = '';
    await loadSlots();
    notify('병원을 등록했습니다.');
  } catch (error) { notify(error.message, true); }
});

// 기능: 선착순 예약
$('reserve').addEventListener('click', async () => {
  try {
    const id = selected;
    if (!id) throw new Error('지도에서 병원을 먼저 선택하세요.');
    showStatus(await api(`/api/slots/${id}/reservations`, {nickname: $('nickname').value, dose: $('dose').value}));
    await loadSlots();
    $('nickname').value = '';
    notify('예약되었습니다.');
  } catch (error) { notify(error.message, true); }
});

// 기능: 예약 현황 확인
const refresh = () => loadStatus().catch(error => { notify(error.message, true); });
$('status-refresh').addEventListener('click', refresh);

// 탭: 환자용·병원용 화면 중 하나만 보여줍니다. 처음에는 환자용이 보입니다.
function showTab(name) {
  $('view-patient').hidden = name !== 'patient';
  $('view-clinic').hidden = name !== 'clinic';
  $('tab-patient').classList.toggle('active', name === 'patient');
  $('tab-clinic').classList.toggle('active', name === 'clinic');
}
$('tab-patient').addEventListener('click', () => showTab('patient'));
$('tab-clinic').addEventListener('click', () => showTab('clinic'));

// 페이지를 열면 목록과 현황을 한 번 불러옵니다.
loadSlots().then(loadStatus).catch(error => { notify(error.message, true); });