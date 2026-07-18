const {
  supabase,
  toast,
  escapeHtml,
  toIso,
  toLocalInput,
  dateTimeText,
  requireSession,
  signOut
} = window.TrailApp;

const state = {
  session: null,
  user: null,
  organizations: [],
  organizationId: null,
  events: [],
  managedEventId: null,
  categories: [],
  points: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function resetEventForm() {
  $('#event-form').reset();
  $('#event-id').value = '';
  $('#event-status').value = 'DRAFT';
  $('#offline-enabled').checked = true;
}

function resetCategoryForm() {
  $('#category-form').reset();
  $('#category-id').value = '';
  $('#timing-mode').value = 'GUN';
  $('#category-order').value = '0';
  $('#category-active').checked = true;
}

function resetPointForm() {
  $('#point-form').reset();
  $('#point-id').value = '';
  $('#point-type').value = 'START';
  $('#point-scan-mode').value = 'SINGLE';
  $('#point-order').value = '0';
  $('#point-offline').checked = true;
  $('#point-manual').checked = true;
  $('#point-active').checked = true;
  $('#point-dashboard').checked = true;
}

function selectTab(tabName) {
  $$('.tab-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  $$('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  $(`#tab-${tabName}`).classList.remove('hidden');
}

async function loadOrganizations(preferredId = null) {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, role_code, status, organizations(id,name,slug,timezone,status)')
    .eq('status', 'ACTIVE');

  if (error) throw error;

  state.organizations = (data || [])
    .filter((row) => row.organizations)
    .map((row) => ({ ...row.organizations, role_code: row.role_code }));

  const select = $('#organization-select');
  select.innerHTML = state.organizations.length
    ? state.organizations.map((org) => `<option value="${org.id}">${escapeHtml(org.name)} (${escapeHtml(org.role_code)})</option>`).join('')
    : '<option value="">ยังไม่มีองค์กร</option>';

  if (!state.organizations.length) {
    state.organizationId = null;
    $('#organization-empty').classList.remove('hidden');
    $('#app-content').classList.add('hidden');
    return;
  }

  const saved = localStorage.getItem('trail_scan_org_id');
  const candidate = preferredId || saved;
  const selected = state.organizations.find((org) => org.id === candidate) || state.organizations[0];
  state.organizationId = selected.id;
  select.value = selected.id;
  localStorage.setItem('trail_scan_org_id', selected.id);

  $('#organization-empty').classList.add('hidden');
  $('#app-content').classList.remove('hidden');
  await loadEvents();
}

async function loadEvents() {
  if (!state.organizationId) return;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('organization_id', state.organizationId)
    .order('race_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  state.events = data || [];
  renderEvents();
  renderManagedEventOptions();
}

function renderEvents() {
  const target = $('#event-list');
  if (!state.events.length) {
    target.innerHTML = '<div class="notice">ยังไม่มี Event</div>';
    return;
  }

  target.innerHTML = state.events.map((event) => `
    <article class="item">
      <div class="item-head">
        <div>
          <strong>${escapeHtml(event.name)}</strong>
          <div class="muted">${escapeHtml(event.event_code || '-')} • ${escapeHtml(event.race_date)} • ${escapeHtml(event.location_name || '-')}</div>
          <div style="margin-top:6px">
            <span class="badge ${event.status === 'ACTIVE' ? 'badge-success' : ''}">${escapeHtml(event.status)}</span>
            ${event.offline_enabled ? '<span class="badge">Offline</span>' : ''}
          </div>
        </div>
        <div class="item-actions">
          <button class="btn btn-small" data-action="edit-event" data-id="${event.id}">แก้ไข</button>
          <button class="btn btn-small btn-primary" data-action="manage-event" data-id="${event.id}">ตั้งค่า</button>
          ${event.status !== 'ARCHIVED' ? `<button class="btn btn-small btn-warning" data-action="archive-event" data-id="${event.id}">เก็บถาวร</button>` : ''}
        </div>
      </div>
    </article>
  `).join('');
}

function renderManagedEventOptions() {
  const select = $('#managed-event-select');
  const activeEvents = state.events.filter((event) => event.status !== 'ARCHIVED');
  select.innerHTML = activeEvents.length
    ? '<option value="">เลือก Event</option>' + activeEvents.map((event) => `<option value="${event.id}">${escapeHtml(event.name)} — ${escapeHtml(event.race_date)}</option>`).join('')
    : '<option value="">ยังไม่มี Event</option>';

  if (state.managedEventId && activeEvents.some((event) => event.id === state.managedEventId)) {
    select.value = state.managedEventId;
  } else {
    state.managedEventId = null;
    $('#event-setup-empty').classList.remove('hidden');
    $('#event-setup-content').classList.add('hidden');
  }
}

async function loadEventSetup() {
  state.managedEventId = $('#managed-event-select').value || null;
  if (!state.managedEventId) {
    $('#event-setup-empty').classList.remove('hidden');
    $('#event-setup-content').classList.add('hidden');
    return;
  }

  $('#event-setup-empty').classList.add('hidden');
  $('#event-setup-content').classList.remove('hidden');
  await Promise.all([loadCategories(), loadPoints()]);
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('race_categories')
    .select('*')
    .eq('event_id', state.managedEventId)
    .order('sort_order')
    .order('name');
  if (error) throw error;
  state.categories = data || [];
  renderCategories();
}

function renderCategories() {
  const target = $('#category-list');
  if (!state.categories.length) {
    target.innerHTML = '<div class="notice">ยังไม่มีประเภทการแข่งขัน</div>';
    return;
  }

  target.innerHTML = state.categories.map((category) => `
    <article class="item">
      <div class="item-head">
        <div>
          <strong>${escapeHtml(category.name)}</strong>
          <div class="muted">${escapeHtml(category.code)} • ${category.distance_km ?? '-'} กม. • ${escapeHtml(category.timing_mode)}</div>
          <div class="muted">กำหนดปล่อย: ${dateTimeText(category.scheduled_start_at)}</div>
          <div class="muted">ปล่อยจริง: ${dateTimeText(category.actual_start_at)}</div>
          <div style="margin-top:6px"><span class="badge ${category.is_active ? 'badge-success' : 'badge-danger'}">${category.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></div>
        </div>
        <div class="item-actions">
          <button class="btn btn-small" data-action="edit-category" data-id="${category.id}">แก้ไข</button>
          <button class="btn btn-small btn-success" data-action="start-now" data-id="${category.id}">ปล่อยตัวตอนนี้</button>
          <button class="btn btn-small btn-warning" data-action="toggle-category" data-id="${category.id}">${category.is_active ? 'ปิด' : 'เปิด'}</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadPoints() {
  const { data, error } = await supabase
    .from('scan_points')
    .select('*, scan_point_categories(race_category_id,sequence_no,is_required,cutoff_at,opens_at,closes_at)')
    .eq('event_id', state.managedEventId)
    .order('display_order')
    .order('created_at');
  if (error) throw error;
  state.points = data || [];
  renderPoints();
}

function renderPoints() {
  const target = $('#point-list');
  if (!state.points.length) {
    target.innerHTML = '<div class="notice">ยังไม่มีจุดสแกน</div>';
    return;
  }

  target.innerHTML = state.points.map((point, index) => {
    const routeNames = (point.scan_point_categories || []).map((route) => {
      const cat = state.categories.find((c) => c.id === route.race_category_id);
      return cat ? `${cat.code}:${route.sequence_no}` : `?:${route.sequence_no}`;
    });
    return `
      <article class="item">
        <div class="item-head">
          <div>
            <strong>${escapeHtml(point.name)}</strong>
            <div class="muted">${escapeHtml(point.point_type)} • ${escapeHtml(point.code)} • ลำดับแสดง ${point.display_order}</div>
            <div class="muted">ระยะ ${point.distance_km ?? '-'} กม. • ${escapeHtml(point.scan_mode)}</div>
            <div style="margin-top:6px">
              <span class="badge ${point.is_active ? 'badge-success' : 'badge-danger'}">${point.is_active ? 'เปิด' : 'ปิด'}</span>
              ${point.allow_offline ? '<span class="badge">Offline</span>' : ''}
              ${routeNames.map((name) => `<span class="badge">${escapeHtml(name)}</span>`).join('')}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn btn-small" data-action="point-up" data-id="${point.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn btn-small" data-action="point-down" data-id="${point.id}" ${index === state.points.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn btn-small" data-action="edit-point" data-id="${point.id}">แก้ไข</button>
            <button class="btn btn-small btn-primary" data-action="edit-route" data-id="${point.id}">เส้นทาง</button>
            <button class="btn btn-small btn-warning" data-action="toggle-point" data-id="${point.id}">${point.is_active ? 'ปิด' : 'เปิด'}</button>
            <button class="btn btn-small btn-danger" data-action="delete-point" data-id="${point.id}">ลบ</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function openRouteEditor(pointId) {
  const point = state.points.find((item) => item.id === pointId);
  if (!point) return;

  $('#route-point-id').value = point.id;
  $('#route-title').textContent = `กำหนดเส้นทาง: ${point.name}`;
  const existingMap = new Map((point.scan_point_categories || []).map((route) => [route.race_category_id, route]));

  $('#route-fields').innerHTML = state.categories.length
    ? state.categories.map((category) => {
      const route = existingMap.get(category.id);
      return `
        <div class="route-row item">
          <label class="inline-check" style="margin:0">
            <input type="checkbox" data-route-enabled="${category.id}" ${route ? 'checked' : ''}>
            ${escapeHtml(category.code)} — ${escapeHtml(category.name)}
          </label>
          <input type="number" min="0" placeholder="ลำดับ" value="${route?.sequence_no ?? ''}" data-route-sequence="${category.id}">
          <input class="cutoff-field" type="datetime-local" value="${toLocalInput(route?.cutoff_at)}" data-route-cutoff="${category.id}" title="Cut-off เฉพาะประเภท">
        </div>
      `;
    }).join('')
    : '<div class="notice notice-warning">ต้องสร้างประเภทการแข่งขันก่อน</div>';

  $('#route-card').classList.remove('hidden');
  $('#route-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveRoutes(event) {
  event.preventDefault();
  const pointId = $('#route-point-id').value;
  if (!pointId) return;

  const rows = [];
  for (const category of state.categories) {
    const enabled = document.querySelector(`[data-route-enabled="${category.id}"]`)?.checked;
    if (!enabled) continue;
    const sequenceValue = document.querySelector(`[data-route-sequence="${category.id}"]`)?.value;
    if (sequenceValue === '') {
      toast(`กรุณากำหนดลำดับของ ${category.code}`, 'error');
      return;
    }
    rows.push({
      organization_id: state.organizationId,
      event_id: state.managedEventId,
      scan_point_id: pointId,
      race_category_id: category.id,
      sequence_no: Number(sequenceValue),
      is_required: true,
      cutoff_at: toIso(document.querySelector(`[data-route-cutoff="${category.id}"]`)?.value)
    });
  }

  const button = event.submitter;
  button.disabled = true;
  const { error: deleteError } = await supabase
    .from('scan_point_categories')
    .delete()
    .eq('scan_point_id', pointId);

  if (deleteError) {
    button.disabled = false;
    return toast(deleteError.message, 'error');
  }

  if (rows.length) {
    const { error: insertError } = await supabase.from('scan_point_categories').insert(rows);
    if (insertError) {
      button.disabled = false;
      toast(`บันทึกเส้นทางไม่สำเร็จ: ${insertError.message}`, 'error');
      await loadPoints();
      return;
    }
  }

  button.disabled = false;
  toast('บันทึกเส้นทางแล้ว', 'success');
  await loadPoints();
  openRouteEditor(pointId);
}

async function swapPointOrder(pointId, direction) {
  const index = state.points.findIndex((point) => point.id === pointId);
  const otherIndex = index + direction;
  if (index < 0 || otherIndex < 0 || otherIndex >= state.points.length) return;

  const a = state.points[index];
  const b = state.points[otherIndex];
  const aOrder = a.display_order;
  const bOrder = b.display_order;

  const { error: firstError } = await supabase.from('scan_points').update({ display_order: bOrder }).eq('id', a.id);
  if (firstError) return toast(firstError.message, 'error');
  const { error: secondError } = await supabase.from('scan_points').update({ display_order: aOrder }).eq('id', b.id);
  if (secondError) return toast(secondError.message, 'error');
  await loadPoints();
}

async function initialize() {
  state.session = await requireSession();
  state.user = state.session.user;
  await loadOrganizations();
}

$('#logout-btn').addEventListener('click', signOut);
$('#new-org-btn').addEventListener('click', () => $('#org-dialog').showModal());
$$('[data-open-org]').forEach((button) => button.addEventListener('click', () => $('#org-dialog').showModal()));
$('#cancel-org-btn').addEventListener('click', () => $('#org-dialog').close());

$('#organization-select').addEventListener('change', async (event) => {
  state.organizationId = event.target.value || null;
  localStorage.setItem('trail_scan_org_id', state.organizationId || '');
  state.managedEventId = null;
  resetEventForm();
  await loadEvents();
});

$$('.tab-btn').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
$('#reload-events-btn').addEventListener('click', loadEvents);
$('#reload-setup-btn').addEventListener('click', loadEventSetup);
$('#managed-event-select').addEventListener('change', loadEventSetup);
$('#reset-event-btn').addEventListener('click', resetEventForm);
$('#reset-category-btn').addEventListener('click', resetCategoryForm);
$('#reset-point-btn').addEventListener('click', resetPointForm);
$('#close-route-btn').addEventListener('click', () => $('#route-card').classList.add('hidden'));
$('#route-form').addEventListener('submit', saveRoutes);

$('#organization-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const name = $('#org-name').value.trim();
  const slug = $('#org-slug').value.trim().toLowerCase();
  const { data, error } = await supabase.rpc('create_organization', {
    p_name: name,
    p_slug: slug,
    p_timezone: 'Asia/Bangkok'
  });
  button.disabled = false;
  if (error) return toast(error.message, 'error');
  $('#org-dialog').close();
  $('#organization-form').reset();
  toast('สร้างองค์กรสำเร็จ', 'success');
  await loadOrganizations(data);
});

$('#event-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.organizationId) return toast('กรุณาเลือกองค์กร', 'error');
  const button = event.submitter;
  button.disabled = true;
  const id = $('#event-id').value;
  const payload = {
    organization_id: state.organizationId,
    name: $('#event-name').value.trim(),
    slug: $('#event-slug').value.trim().toLowerCase(),
    event_code: $('#event-code').value.trim() || null,
    race_date: $('#race-date').value,
    timezone: 'Asia/Bangkok',
    location_name: $('#location-name').value.trim() || null,
    location_detail: $('#location-detail').value.trim() || null,
    status: $('#event-status').value,
    offline_enabled: $('#offline-enabled').checked
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('events').update(payload).eq('id', id));
  } else {
    payload.created_by = state.user.id;
    ({ error } = await supabase.from('events').insert(payload));
  }
  button.disabled = false;
  if (error) return toast(error.message, 'error');
  toast(id ? 'แก้ไข Event แล้ว' : 'สร้าง Event แล้ว', 'success');
  resetEventForm();
  await loadEvents();
});

$('#event-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = state.events.find((row) => row.id === button.dataset.id);
  if (!item) return;

  if (button.dataset.action === 'edit-event') {
    $('#event-id').value = item.id;
    $('#event-name').value = item.name;
    $('#event-slug').value = item.slug;
    $('#event-code').value = item.event_code || '';
    $('#race-date').value = item.race_date;
    $('#location-name').value = item.location_name || '';
    $('#location-detail').value = item.location_detail || '';
    $('#event-status').value = item.status;
    $('#offline-enabled').checked = item.offline_enabled;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (button.dataset.action === 'manage-event') {
    state.managedEventId = item.id;
    selectTab('setup');
    renderManagedEventOptions();
    $('#managed-event-select').value = item.id;
    await loadEventSetup();
  }

  if (button.dataset.action === 'archive-event') {
    if (!confirm(`เก็บ Event “${item.name}” เป็น ARCHIVED หรือไม่?`)) return;
    const { error } = await supabase.from('events').update({ status: 'ARCHIVED' }).eq('id', item.id);
    if (error) return toast(error.message, 'error');
    toast('เก็บ Event แล้ว', 'success');
    await loadEvents();
  }
});

$('#category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.managedEventId) return toast('กรุณาเลือก Event', 'error');
  const button = event.submitter;
  button.disabled = true;
  const id = $('#category-id').value;
  const payload = {
    organization_id: state.organizationId,
    event_id: state.managedEventId,
    code: $('#category-code').value.trim().toUpperCase(),
    name: $('#category-name').value.trim(),
    distance_km: nullableNumber($('#distance-km').value),
    bib_prefix: $('#bib-prefix').value.trim() || null,
    timing_mode: $('#timing-mode').value,
    scheduled_start_at: toIso($('#scheduled-start').value),
    cutoff_at: toIso($('#category-cutoff').value),
    sort_order: Number($('#category-order').value || 0),
    is_active: $('#category-active').checked
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('race_categories').update(payload).eq('id', id));
  } else {
    payload.created_by = state.user.id;
    ({ error } = await supabase.from('race_categories').insert(payload));
  }
  button.disabled = false;
  if (error) return toast(error.message, 'error');
  toast(id ? 'แก้ไขประเภทแล้ว' : 'สร้างประเภทแล้ว', 'success');
  resetCategoryForm();
  await Promise.all([loadCategories(), loadPoints()]);
});

$('#category-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const category = state.categories.find((row) => row.id === button.dataset.id);
  if (!category) return;

  if (button.dataset.action === 'edit-category') {
    $('#category-id').value = category.id;
    $('#category-code').value = category.code;
    $('#category-name').value = category.name;
    $('#distance-km').value = category.distance_km ?? '';
    $('#bib-prefix').value = category.bib_prefix || '';
    $('#timing-mode').value = category.timing_mode;
    $('#scheduled-start').value = toLocalInput(category.scheduled_start_at);
    $('#category-cutoff').value = toLocalInput(category.cutoff_at);
    $('#category-order').value = category.sort_order;
    $('#category-active').checked = category.is_active;
    $('#category-form').scrollIntoView({ behavior: 'smooth' });
  }

  if (button.dataset.action === 'toggle-category') {
    const { error } = await supabase.from('race_categories').update({ is_active: !category.is_active }).eq('id', category.id);
    if (error) return toast(error.message, 'error');
    await loadCategories();
  }

  if (button.dataset.action === 'start-now') {
    const reason = prompt('เหตุผลในการบันทึกเวลาปล่อยจริง', 'ปล่อยตัวจริงจากหน้า Admin');
    if (!reason) return;
    const { error } = await supabase.rpc('set_actual_start_time', {
      p_race_category_id: category.id,
      p_actual_start_at: new Date().toISOString(),
      p_reason: reason
    });
    if (error) return toast(error.message, 'error');
    toast('บันทึกเวลาปล่อยจริงแล้ว', 'success');
    await loadCategories();
  }
});

$('#point-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.managedEventId) return toast('กรุณาเลือก Event', 'error');
  const button = event.submitter;
  button.disabled = true;
  const id = $('#point-id').value;
  const payload = {
    organization_id: state.organizationId,
    event_id: state.managedEventId,
    point_type: $('#point-type').value,
    code: $('#point-code').value.trim().toUpperCase(),
    name: $('#point-name').value.trim(),
    display_order: Number($('#point-order').value || 0),
    distance_km: nullableNumber($('#point-distance').value),
    scheduled_open_at: toIso($('#point-open').value),
    scheduled_close_at: toIso($('#point-close').value),
    default_cutoff_at: toIso($('#point-cutoff').value),
    scan_mode: $('#point-scan-mode').value,
    allow_offline: $('#point-offline').checked,
    allow_manual_entry: $('#point-manual').checked,
    is_active: $('#point-active').checked,
    show_on_dashboard: $('#point-dashboard').checked
  };

  let error;
  if (id) {
    ({ error } = await supabase.from('scan_points').update(payload).eq('id', id));
  } else {
    payload.created_by = state.user.id;
    ({ error } = await supabase.from('scan_points').insert(payload));
  }
  button.disabled = false;
  if (error) return toast(error.message, 'error');
  toast(id ? 'แก้ไขจุดสแกนแล้ว' : 'สร้างจุดสแกนแล้ว', 'success');
  resetPointForm();
  await loadPoints();
});

$('#point-list').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const point = state.points.find((row) => row.id === button.dataset.id);
  if (!point) return;

  if (button.dataset.action === 'edit-point') {
    $('#point-id').value = point.id;
    $('#point-type').value = point.point_type;
    $('#point-code').value = point.code;
    $('#point-name').value = point.name;
    $('#point-order').value = point.display_order;
    $('#point-distance').value = point.distance_km ?? '';
    $('#point-open').value = toLocalInput(point.scheduled_open_at);
    $('#point-close').value = toLocalInput(point.scheduled_close_at);
    $('#point-cutoff').value = toLocalInput(point.default_cutoff_at);
    $('#point-scan-mode').value = point.scan_mode;
    $('#point-offline').checked = point.allow_offline;
    $('#point-manual').checked = point.allow_manual_entry;
    $('#point-active').checked = point.is_active;
    $('#point-dashboard').checked = point.show_on_dashboard;
    $('#point-form').scrollIntoView({ behavior: 'smooth' });
  }

  if (button.dataset.action === 'edit-route') openRouteEditor(point.id);
  if (button.dataset.action === 'point-up') await swapPointOrder(point.id, -1);
  if (button.dataset.action === 'point-down') await swapPointOrder(point.id, 1);

  if (button.dataset.action === 'toggle-point') {
    const { error } = await supabase.from('scan_points').update({ is_active: !point.is_active }).eq('id', point.id);
    if (error) return toast(error.message, 'error');
    await loadPoints();
  }

  if (button.dataset.action === 'delete-point') {
    if (!confirm(`ลบจุด “${point.name}” หรือไม่? หากมีประวัติสแกนแล้ว ระบบอาจไม่อนุญาตให้ลบ`)) return;
    const { error } = await supabase.from('scan_points').delete().eq('id', point.id);
    if (error) return toast(`ลบไม่ได้ ให้ใช้ปุ่มปิดแทน: ${error.message}`, 'error');
    toast('ลบจุดสแกนแล้ว', 'success');
    await loadPoints();
  }
});

initialize().catch((error) => {
  if (error.message !== 'AUTH_REQUIRED') {
    console.error(error);
    toast(error.message || 'โหลดระบบไม่สำเร็จ', 'error');
  }
});
