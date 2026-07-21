(() => {
  'use strict';
  const cfg = window.TRAIL_SCAN_CONFIG;
  const $ = id => document.getElementById(id);
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY || !window.supabase?.createClient) {
    document.body.innerHTML = '<div style="padding:30px;font-family:sans-serif">ไม่สามารถเชื่อมต่อระบบผลการแข่งขันได้</div>';
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const state = { events: [], categories: [], leaders: [], currentResult: null };
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { dateStyle:'medium', timeStyle:'medium', timeZone: cfg.DEFAULT_TIMEZONE || 'Asia/Bangkok' }).format(date);
  };
  const fmtDate = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('th-TH', { dateStyle:'long', timeZone: cfg.DEFAULT_TIMEZONE || 'Asia/Bangkok' }).format(date);
  };
  const duration = seconds => {
    if (seconds == null || Number.isNaN(Number(seconds))) return '—';
    const total = Math.max(0, Number(seconds));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = Math.floor(total % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  };
  const loading = on => $('loading').hidden = !on;
  const statusLabel = status => ({ FINISHER:'เข้าเส้นแล้ว', LATE_FINISH:'เข้าเส้นหลัง Cut-off', PENDING_REVIEW:'รอตรวจสอบ', PENDING:'กำลังแข่งขัน', DNS:'ไม่ได้ออกตัว', DNF:'ออกจากการแข่งขัน', DSQ:'ตัดสิทธิ์' }[status] || status || '—');
  const statusClass = status => status === 'PENDING_REVIEW' ? ' pending' : status === 'LATE_FINISH' ? ' late' : '';

  function setTab(name) {
    document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    document.querySelectorAll('.rr-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${name}`));
  }

  function updateUrl(extra = {}) {
    const params = new URLSearchParams(location.search);
    const eventId = $('eventSelect').value;
    if (eventId) params.set('event', eventId); else params.delete('event');
    Object.entries(extra).forEach(([key,value]) => value ? params.set(key,value) : params.delete(key));
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  }

  async function loadEvents() {
    const { data, error } = await db.rpc('runner_portal_events');
    if (error) throw error;
    state.events = data || [];
    $('eventSelect').innerHTML = state.events.length
      ? state.events.map(event => `<option value="${event.event_id}">${esc(event.event_name)} · ${fmtDate(event.race_date)}</option>`).join('')
      : '<option value="">ยังไม่มีงานที่เปิดผลการแข่งขัน</option>';
    const requested = new URL(location.href).searchParams.get('event');
    if (requested && state.events.some(event => event.event_id === requested)) $('eventSelect').value = requested;
    if (!state.events.length) {
      $('eventMeta').textContent = 'ขณะนี้ยังไม่มีงานที่เปิดผลต่อสาธารณะ';
      $('leaderRows').innerHTML = '<tr><td colspan="9"><div class="rr-empty">ยังไม่มีงานที่เปิดผลการแข่งขัน</div></td></tr>';
      return;
    }
    await selectEvent();
  }

  async function selectEvent() {
    const eventId = $('eventSelect').value;
    const event = state.events.find(item => item.event_id === eventId);
    $('eventMeta').innerHTML = event
      ? `<strong>${esc(event.event_name)}</strong><br>${esc(event.location_name || 'ไม่ระบุสถานที่')} · ${fmtDate(event.race_date)} · ${event.results_mode === 'FINAL_ONLY' ? 'ผลอย่างเป็นทางการ' : 'ผล LIVE'}`
      : 'เลือกงานแข่งขันเพื่อดูข้อมูล';
    updateUrl({ bib: '' });
    $('runnerResult').hidden = true;
    $('lookupMessage').textContent = '';
    await Promise.all([loadCategories(), loadLeaderboard()]);
  }

  async function loadCategories() {
    const eventId = $('eventSelect').value;
    if (!eventId) return;
    const { data, error } = await db.rpc('runner_portal_categories', { p_event_id: eventId });
    if (error) throw error;
    state.categories = data || [];
    const previous = $('categorySelect').value;
    $('categorySelect').innerHTML = '<option value="">ทุกประเภท</option>' + state.categories.map(category => `<option value="${category.category_id}">${esc(category.category_name)}${category.distance_km != null ? ` · ${category.distance_km} KM` : ''}</option>`).join('');
    if (state.categories.some(category => category.category_id === previous)) $('categorySelect').value = previous;
  }

  async function loadLeaderboard() {
    const eventId = $('eventSelect').value;
    if (!eventId) return;
    loading(true);
    try {
      const { data, error } = await db.rpc('runner_portal_leaderboard', {
        p_event_id: eventId,
        p_category_id: $('categorySelect').value || null,
        p_limit: 500
      });
      if (error) throw error;
      state.leaders = data || [];
      renderLeaderboard();
    } catch (error) {
      console.error(error);
      $('leaderRows').innerHTML = `<tr><td colspan="9"><div class="rr-empty">โหลดตารางลำดับไม่สำเร็จ<br><small>${esc(error.message)}</small></div></td></tr>`;
    } finally { loading(false); }
  }

  function renderLeaderboard() {
    const search = $('leaderSearch').value.trim().toLowerCase();
    const rows = state.leaders.filter(row => !search || `${row.bib_number} ${row.display_name}`.toLowerCase().includes(search));
    $('leaderSummary').textContent = state.leaders.length ? `แสดง ${rows.length.toLocaleString()} จาก ${state.leaders.length.toLocaleString()} คนที่เข้าเส้น` : 'ยังไม่มีนักวิ่งเข้าเส้นในรายการที่เลือก';
    $('leaderRows').innerHTML = rows.length ? rows.map(row => `<tr>
      <td><span class="rr-place${Number(row.overall_rank) <= 3 ? ' top' : ''}">${row.overall_rank ?? '—'}</span></td>
      <td><span class="rr-bib">${esc(row.bib_number)}</span></td>
      <td class="rr-runner-cell"><strong>${esc(row.display_name)}</strong><small>${esc(row.gender_label || '')}</small></td>
      <td>${esc(row.category_name)}${row.distance_km != null ? `<small style="display:block;color:var(--muted)">${row.distance_km} KM</small>` : ''}</td>
      <td>${esc(row.age_group || 'ไม่ระบุ')}</td>
      <td>${fmt(row.finish_at)}</td>
      <td><strong>${duration(row.elapsed_seconds)}</strong></td>
      <td>${row.category_rank ?? '—'}</td>
      <td><span class="rr-chip${statusClass(row.result_status)}">${esc(statusLabel(row.result_status))}</span></td>
    </tr>`).join('') : '<tr><td colspan="9"><div class="rr-empty">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div></td></tr>';
  }

  async function lookupRunner(event) {
    event.preventDefault();
    const eventId = $('eventSelect').value;
    const bib = $('bibInput').value.trim().toUpperCase();
    $('lookupMessage').textContent = '';
    $('runnerResult').hidden = true;
    if (!eventId || !bib) return;
    loading(true);
    try {
      const { data, error } = await db.rpc('runner_portal_result', { p_event_id: eventId, p_bib_number: bib });
      if (error) throw error;
      if (!data?.runner) {
        $('lookupMessage').textContent = 'ไม่พบเลข BIB นี้ในงานที่เลือก';
        return;
      }
      state.currentResult = data;
      renderRunner(data);
      updateUrl({ bib });
    } catch (error) {
      console.error(error);
      $('lookupMessage').textContent = `ค้นหาผลไม่สำเร็จ: ${error.message}`;
    } finally { loading(false); }
  }

  function renderRunner(data) {
    const runner = data.runner || {};
    $('runnerStatus').textContent = statusLabel(runner.result_status || runner.runner_status);
    $('runnerName').textContent = runner.display_name || '—';
    $('runnerBib').textContent = runner.bib_number || '—';
    $('runnerCategory').textContent = `${runner.category_name || '—'}${runner.distance_km != null ? ` ${runner.distance_km} KM` : ''}`;
    $('runnerAge').textContent = runner.age_group || 'ไม่ระบุ';
    $('runnerOverallRank').textContent = runner.overall_rank || '—';
    $('runnerStart').textContent = fmt(runner.start_at);
    $('runnerFinish').textContent = fmt(runner.finish_at);
    $('runnerElapsed').textContent = duration(runner.elapsed_seconds);
    $('runnerCategoryRank').textContent = runner.category_rank || '—';
    $('runnerAgeRank').textContent = runner.age_group_rank || '—';
    $('runnerEventName').textContent = data.event?.name || '—';
    const checkpoints = data.checkpoints || [];
    $('checkpointRows').innerHTML = checkpoints.length ? checkpoints.map((point,index) => `<tr><td>${index+1}</td><td><strong>${esc(point.point_name)}</strong><small style="display:block;color:var(--muted)">${esc(point.point_code)}</small></td><td>${esc(point.point_type)}</td><td>${point.distance_km ?? '—'} KM</td><td>${fmt(point.scan_time)}</td></tr>`).join('') : '<tr><td colspan="5"><div class="rr-empty">ยังไม่มีข้อมูลผ่านจุดที่เปิดเผย</div></td></tr>';
    $('runnerResult').hidden = false;
    $('runnerResult').scrollIntoView({ behavior:'smooth', block:'start' });
  }

  async function shareResult() {
    const runner = state.currentResult?.runner;
    if (!runner) return;
    const url = location.href;
    const text = `${runner.display_name} BIB ${runner.bib_number} ลำดับรวม ${runner.overall_rank || '—'} เวลา ${duration(runner.elapsed_seconds)}`;
    if (navigator.share) {
      try { await navigator.share({ title:'ผลการแข่งขัน', text, url }); return; } catch {}
    }
    await navigator.clipboard?.writeText(url);
    $('lookupMessage').style.color = 'var(--green)';
    $('lookupMessage').textContent = 'คัดลอกลิงก์ผลการแข่งขันแล้ว';
  }

  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
  $('eventSelect').addEventListener('change', selectEvent);
  $('categorySelect').addEventListener('change', loadLeaderboard);
  $('leaderSearch').addEventListener('input', renderLeaderboard);
  $('refreshLeaderboard').addEventListener('click', loadLeaderboard);
  $('lookupForm').addEventListener('submit', lookupRunner);
  $('shareResult').addEventListener('click', shareResult);

  loadEvents().then(() => {
    const params = new URL(location.href).searchParams;
    const bib = params.get('bib');
    if (bib && $('eventSelect').value) {
      setTab('lookup');
      $('bibInput').value = bib;
      $('lookupForm').requestSubmit();
    }
  }).catch(error => {
    console.error(error);
    $('eventSelect').innerHTML = '<option value="">เชื่อมต่อระบบผลการแข่งขันไม่สำเร็จ</option>';
    $('eventMeta').textContent = error.message;
  });
})();