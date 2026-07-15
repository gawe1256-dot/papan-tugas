(function() {
  const boardRoot = document.getElementById('boardRoot');
  const overlayRoot = document.getElementById('overlayRoot');
  const STORAGE_KEY = 'papan-tugas-data';

  const CATEGORIES = {
    tugas:      { label: 'Tugas',       color: '#3a6ea5' },
    kuis:       { label: 'Kuis',        color: '#8a4fb0' },
    ujian:      { label: 'UTS/UAS',     color: '#c93b3b' },
    praktikum:  { label: 'Praktikum',   color: '#4f8f5b' },
    presentasi: { label: 'Presentasi',  color: '#dba320' },
    lainnya:    { label: 'Lainnya',     color: '#6b6b6b' },
  };

  let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  let activeFilter = 'semua';
  let notifPermission = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  let notifiedIds = new Set(JSON.parse(localStorage.getItem('papan-tugas-notified') || '[]'));

  function saveTasks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  function saveNotified() { localStorage.setItem('papan-tugas-notified', JSON.stringify([...notifiedIds])); }

  const rotations = [-3, -1.5, 0.5, 2, -2.5, 1.5, 3, -0.5, 2.5, -1];
  function rotFor(id) { let h=0; for (let i=0;i<id.length;i++) h=(h*31+id.charCodeAt(i))>>>0; return rotations[h % rotations.length]; }
  function pinFor(id) { const p=['#c93b3b','#3a6ea5','#dba320','#4f8f5b','#8a4fb0']; let h=0; for (let i=0;i<id.length;i++) h=(h*17+id.charCodeAt(i))>>>0; return p[h % p.length]; }
  function daysUntil(dateStr) { const t=new Date(); t.setHours(0,0,0,0); const d=new Date(dateStr+'T00:00:00'); return Math.round((d-t)/86400000); }
  function deadlineDateTime(task) { return new Date(task.deadline + 'T' + (task.time || '23:59') + ':00'); }
  function hoursUntil(task) { return (deadlineDateTime(task) - new Date()) / 3600000; }
  function urgencyInfo(task) {
    const d = daysUntil(task.deadline);
    const h = hoursUntil(task);
    if (h < 0) {
      const hoursLate = Math.abs(h);
      const label = hoursLate < 24 ? 'Telat ' + Math.round(hoursLate) + ' jam' : 'Telat ' + Math.abs(d) + ' hari';
      return { label, bg:'var(--card-overdue)', line:'var(--card-overdue-line)', badgeColor:'var(--pin-red)' };
    }
    if (d === 0) return { label:'Hari ini!', bg:'var(--card-overdue)', line:'var(--card-overdue-line)', badgeColor:'var(--pin-red)' };
    if (d === 1) return { label:'Besok', bg:'var(--card-urgent)', line:'var(--card-urgent-line)', badgeColor:'#b0512f' };
    if (d <= 6) return { label:d+' hari lagi', bg:'var(--card-soon)', line:'var(--card-soon-line)', badgeColor:'#8a6a10' };
    return { label:d+' hari lagi', bg:'var(--card-safe)', line:'var(--card-safe-line)', badgeColor:'#3d6b2f' };
  }
  function formatDate(task) {
    const d = new Date(task.deadline+'T00:00:00');
    const tanggal = d.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
    return task.time ? `${tanggal}, ${task.time}` : tanggal;
  }
  function escapeHtml(str) { const div=document.createElement('div'); div.textContent=str; return div.innerHTML; }

  function renderApp() {
    boardRoot.innerHTML = `
      <div class="board-header">
        <div>
          <h1 class="board-title">Papan Tugas</h1>
          <div class="board-subtitle">Semua PR &amp; deadline, nempel di sini biar ga lupa</div>
        </div>
        <div class="header-actions">
          <button class="ghost-btn ${notifPermission==='granted'?'active':''}" id="notifBtn">${notifPermission==='granted' ? '🔔 Pengingat aktif' : '🔕 Aktifkan Pengingat'}</button>
          <button class="add-btn" id="openModalBtn">📌 Tempel Tugas</button>
        </div>
      </div>
      <div class="legend">
        <span><span class="dot" style="background:#4f8f5b"></span> Masih lama</span>
        <span><span class="dot" style="background:#dba320"></span> Minggu ini</span>
        <span><span class="dot" style="background:#3a6ea5"></span> Besok / lusa</span>
        <span><span class="dot" style="background:#c93b3b"></span> Hari ini / telat</span>
      </div>
      <div class="filters" id="filters"></div>
      <div id="reminderBanner"></div>
      <div id="cardsContainer"></div>
    `;
    document.getElementById('openModalBtn').addEventListener('click', openTaskModal);
    document.getElementById('notifBtn').addEventListener('click', requestNotifPermission);
    renderFilters();
    renderReminderBanner();
    renderCards();
  }

  function renderFilters() {
    const filters = document.getElementById('filters');
    let html = `<button class="chip ${activeFilter==='semua'?'active':''}" data-cat="semua">Semua</button>`;
    Object.entries(CATEGORIES).forEach(([key,c]) => { html += `<button class="chip ${activeFilter===key?'active':''}" data-cat="${key}">${c.label}</button>`; });
    filters.innerHTML = html;
    filters.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => { activeFilter = btn.dataset.cat; renderFilters(); renderCards(); }));
  }

  function renderReminderBanner() {
    const banner = document.getElementById('reminderBanner');
    const urgent = tasks.filter(t => hoursUntil(t) <= 0);
    banner.innerHTML = urgent.length ? `<div class="reminder-banner">⚠️ ${urgent.length} tugas hari ini atau sudah lewat deadline — cek papan di bawah!</div>` : '';
  }

  function renderCards() {
    const container = document.getElementById('cardsContainer');
    const filtered = activeFilter === 'semua' ? tasks : tasks.filter(t => (t.category||'lainnya') === activeFilter);
    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="big">${tasks.length===0?'Papan gabus masih kosong 🌿':'Ga ada tugas di kategori ini'}</div><div class="small">${tasks.length===0?'Tempel tugas pertamamu biar ga kelupaan lagi.':'Coba pilih kategori lain.'}</div></div>`;
      return;
    }
    const sorted = [...filtered].sort((a,b) => a.deadline.localeCompare(b.deadline));
    container.innerHTML = '<div class="cards-grid" id="grid"></div>';
    const grid = document.getElementById('grid');
    sorted.forEach(task => {
      const u = urgencyInfo(task);
      const cat = CATEGORIES[task.category] || CATEGORIES.lainnya;
      const card = document.createElement('div');
      card.className = 'card';
      card.style.background = u.bg;
      card.style.borderLeft = `4px solid ${u.line}`;
      card.style.transform = `rotate(${rotFor(task.id)}deg)`;
      card.innerHTML = `
        <div class="pin" style="background:${pinFor(task.id)}"></div>
        <div class="card-category" style="color:${cat.color}">${cat.label}</div>
        <div class="card-actions">
          <button class="icon-btn" data-action="done" data-id="${task.id}" title="Selesai">✓</button>
          <button class="icon-btn" data-action="delete" data-id="${task.id}" title="Hapus">✕</button>
        </div>
        <div class="card-course">${escapeHtml(task.course)}</div>
        <div class="card-desc">${escapeHtml(task.desc||'')}</div>
        <div class="card-footer">
          <span class="card-date">${formatDate(task)}</span>
          <span class="card-badge" style="background:#fff;color:${u.badgeColor}">${u.label}</span>
        </div>`;
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('click', () => removeTask(btn.dataset.id)));
  }

  function removeTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    ['24h','1h','late'].forEach(suffix => notifiedIds.delete(id + ':' + suffix));
    saveTasks(); saveNotified();
    renderReminderBanner(); renderCards();
  }

  function openTaskModal() {
    let selectedCat = 'tugas';
    overlayRoot.innerHTML = `
      <div class="overlay" id="overlay">
        <div class="modal">
          <h2>Tempel Tugas Baru</h2>
          <div class="field"><label>Mata Kuliah</label><input type="text" id="courseInput" placeholder="cth. Basis Data" maxlength="60" /></div>
          <div class="field"><label>Kategori</label><div class="cat-picker" id="catPicker"></div></div>
          <div class="field"><label>Detail Tugas (opsional)</label><textarea id="descInput" rows="2" placeholder="cth. Bab 3-4, kumpul di LMS" maxlength="140"></textarea></div>
          <div class="field-row">
            <div class="field"><label>Deadline</label><input type="date" id="dateInput" /></div>
            <div class="field"><label>Jam (opsional)</label><input type="time" id="timeInput" /></div>
          </div>
          <div class="err-text" id="errText">Isi mata kuliah dan deadline dulu ya.</div>
          <div class="modal-actions">
            <button class="btn-secondary" id="cancelBtn">Batal</button>
            <button class="btn-primary" id="saveBtn">Tempel 📌</button>
          </div>
        </div>
      </div>`;
    const catPicker = document.getElementById('catPicker');
    function renderCatPicker() {
      catPicker.innerHTML = Object.entries(CATEGORIES).map(([key,c]) => `<button type="button" class="cat-option ${selectedCat===key?'selected':''}" data-cat="${key}" style="${selectedCat===key ? 'background:'+c.color+';border-color:'+c.color : 'color:'+c.color+';border-color:'+c.color}">${c.label}</button>`).join('');
      catPicker.querySelectorAll('.cat-option').forEach(btn => btn.addEventListener('click', () => { selectedCat = btn.dataset.cat; renderCatPicker(); }));
    }
    renderCatPicker();
    const overlay = document.getElementById('overlay');
    const courseInput = document.getElementById('courseInput');
    const descInput = document.getElementById('descInput');
    const dateInput = document.getElementById('dateInput');
    const timeInput = document.getElementById('timeInput');
    const errText = document.getElementById('errText');
    dateInput.min = new Date().toISOString().slice(0,10);
    courseInput.focus();
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', () => {
      const course = courseInput.value.trim();
      const deadline = dateInput.value;
      if (!course || !deadline) { errText.style.display = 'block'; return; }
      const id = 't' + Date.now() + Math.random().toString(36).slice(2,7);
      tasks.push({ id, course, desc: descInput.value.trim(), deadline, time: timeInput.value || null, category: selectedCat });
      saveTasks(); renderReminderBanner(); renderCards(); closeModal();
      checkAndNotify();
    });
  }
  function closeModal() { overlayRoot.innerHTML = ''; }

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') { alert('Browser ini tidak mendukung notifikasi.'); return; }
    const perm = await Notification.requestPermission();
    notifPermission = perm;
    renderApp();
    if (perm === 'granted') checkAndNotify();
  }
  function sendNotification(title, body) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          reg.showNotification(title, { body, icon: 'icons/icon-192.png' });
        } else {
          try { new Notification(title, { body }); } catch (e) {}
        }
      }).catch(() => {
        try { new Notification(title, { body }); } catch (e) {}
      });
    } else {
      try { new Notification(title, { body }); } catch (e) {}
    }
  }

  function checkAndNotify() {
    if (notifPermission !== 'granted') return;
    let changed = false;
    tasks.forEach(task => {
      const h = hoursUntil(task);
      const mark24 = task.id + ':24h';
      const mark1 = task.id + ':1h';
      const markLate = task.id + ':late';
      if (h <= 24 && h > 1 && !notifiedIds.has(mark24)) {
        sendNotification('📌 Pengingat Tugas', `${task.course} — deadline kurang dari 24 jam lagi!`);
        notifiedIds.add(mark24); changed = true;
      }
      if (h <= 1 && h > 0 && !notifiedIds.has(mark1)) {
        sendNotification('⏰ Deadline Mepet!', `${task.course} — kurang dari 1 jam lagi!`);
        notifiedIds.add(mark1); changed = true;
      }
      if (h <= 0 && !notifiedIds.has(markLate)) {
        sendNotification('⚠️ Deadline Lewat', `${task.course} — deadlinenya sudah lewat!`);
        notifiedIds.add(markLate); changed = true;
      }
    });
    if (changed) saveNotified();
  }

  renderApp();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {}).finally(() => {
      checkAndNotify();
    });
  } else {
    checkAndNotify();
  }
  setInterval(checkAndNotify, 5 * 60 * 1000);
})();
