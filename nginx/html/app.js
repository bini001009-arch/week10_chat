// 화면의 칸·버튼을 id로 찾고, /api/ 주소로 요청을 보냅니다.
const $ = id => document.getElementById(id);
const msg = $('slot-message');

// body가 있으면 POST(등록·예약), 없으면 GET(조회)으로 보냅니다.
async function api(url, body) {
  const options = body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {};
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

// 시간대 목록을 받아 선택 칸(select)에 채웁니다.
async function loadSlots() {
  const data = await api('/api/slots');
  const keep = $('slot-select').value;
  $('slot-select').innerHTML = '';
  for (const slot of data.slots) {
    const option = document.createElement('option');
    option.value = slot.id;
    option.textContent = `${slot.name} (정원 ${slot.capacity}명)`;
    $('slot-select').append(option);
  }
  if (keep) $('slot-select').value = keep;
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
  const id = $('slot-select').value;
  if (!id) { $('status').textContent = '등록된 시간대가 없습니다.'; return; }
  showStatus(await api(`/api/slots/${id}/reservations`));
}

// 기능 1: 시간대 등록
$('slot-add').addEventListener('click', async () => {
  try {
    await api('/api/slots', {name: $('slot-name').value, capacity: Number($('slot-capacity').value)});
    $('slot-name').value = '';
    $('slot-capacity').value = '';
    await loadSlots();
    msg.textContent = '시간대를 등록했습니다.';
  } catch (error) { msg.textContent = error.message; }
});

// 기능 2: 선착순 예약
$('reserve').addEventListener('click', async () => {
  try {
    const id = $('slot-select').value;
    if (!id) throw new Error('먼저 시간대를 등록하세요.');
    showStatus(await api(`/api/slots/${id}/reservations`, {nickname: $('nickname').value, dose: $('dose').value}));
    $('nickname').value = '';
    msg.textContent = '예약되었습니다.';
  } catch (error) { msg.textContent = error.message; }
});

// 기능 3: 예약 현황 확인
const refresh = () => loadStatus().catch(error => { msg.textContent = error.message; });
$('status-refresh').addEventListener('click', refresh);
$('slot-select').addEventListener('change', refresh);

// 페이지를 열면 목록과 현황을 한 번 불러옵니다.
loadSlots().then(loadStatus).catch(error => { msg.textContent = error.message; });