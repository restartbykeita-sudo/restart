(async () => {
  const A = window.App;
  const db = A.db;
  const $ = id => document.getElementById(id);

  await A.init();

  $('userName').textContent = A.profile?.display_name || A.user.email;
  $('userEmail').textContent = A.user.email;
  $('avatar').textContent = ($('userName').textContent || 'A').slice(0, 2).toUpperCase();
  $('logout').onclick = () => A.logout();
  $('menuBtn').onclick = () => $('sidebar').classList.toggle('open');

  const pageMeta = {
    dashboard: ['ภาพรวม', 'ติดตามสถานะการแข่งขัน'],
    organizations: ['องค์กร', 'สร้าง แก้ไข และลบองค์กร'],
    events: ['Event', 'สร้าง แก้ไข และลบงานแข่งขัน'],
    categories: ['ประเภทการแข่งขัน', 'จัดการระยะ เวลาเริ่ม และ Cut-off'],
    points: ['Start / CP / Finish', 'สร้าง แก้ไข ลบ และจัดลำดับจุด'],
    runners: ['นักวิ่งและ QR', 'จัดการ BIB และ QR Token'],
    staff: ['เจ้าหน้าที่', 'กำหนดสิทธิ์ประจำจุด'],
    devices: ['อุปกรณ์ Scanner', 'มือถือและเครื่องสแกนประจำจุด'],
    results: ['ผลการแข่งขัน', 'ตรวจเวลารวมและรายการผิดปกติ']
  };

  const state = {
    events: [],
    dashEvents: [],
    catEvents: [],
    cats: [],
    pointEvents: [],
    points: [],
    pointCats: [],
    routes: [],
    runnerEvents: [],
    runnerCats: [],
    runners: [],
    staffEvents: [],
    staffPoints: [],
    assignments: [],
    members: [],
    profiles: new Map(),
    deviceEvents: [],
    devicePoints: [],
    devices: [],
    resultEvents: [],
    resultCats: [],
    results: [],
    resultRunners: new Map()
  };

  let pendingDelete = null;

  function showPage(name) {
    document.querySelectorAll('.page').forEach(el => {
      el.classList.toggle('active', el.id === `page-${name}`);
    });
    document.querySelectorAll('#nav button[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === name);
    });
    $('topTitle').textContent = pageMeta[name][0];
    $('topSub').textContent = pageMeta[name][1];
    location.hash = name;
    $('sidebar').classList.remove('open');

    const loaders = {
      dashboard: loadDashboard,
      organizations: renderOrganizations,
      events: loadEventsPage,
      categories: loadCategoriesPage,
      points: loadPointsPage,
      runners: loadRunnersPage,
      staff: loadStaffPage,
      devices: loadDevicesPage,
      results: loadResultsPage
    };
    loaders[name]?.();
  }

  document.querySelectorAll('#nav button[data-page]').forEach(button => {
    button.onclick = () => showPage(button.dataset.page);
  });

  document.querySelectorAll('dialog .close').forEach(button => {
    button.onclick = () => button.closest('dialog').close();
  });

  function badge(value) {
    const css = ['ACTIVE', 'FINISHER', 'ACCEPTED'].includes(value)
      ? 'success'
      : ['PENDING_REVIEW', 'SETUP', 'SUSPENDED'].includes(value)
        ? 'warning'
        : ['DSQ', 'DNF', 'REJECTED', 'RETIRED'].includes(value)
          ? 'danger'
          : 'info';
    return `<span class="badge ${css}">${A.esc(value)}</span>`;
  }

  function duration(seconds) {
    if (seconds == null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function fillOrgSelect(select) {
    select.innerHTML = A.orgs.map(org =>
      `<option value="${org.id}">${A.esc(org.name)}</option>`
    ).join('') || '<option value="">ยังไม่มีองค์กร</option>';
    if (A.activeOrg) select.value = A.activeOrg.id;
  }

  const orgSelectIds = [
    'dashOrg', 'eventOrg', 'catOrg', 'pointOrg',
    'runnerOrg', 'staffOrg', 'deviceOrg', 'resultOrg'
  ];

  function refreshAllOrgSelects() {
    orgSelectIds.forEach(id => {
      if ($(id)) fillOrgSelect($(id));
    });
  }

  refreshAllOrgSelects();

  function setOrganization(id) {
    A.activeOrg = A.orgs.find(org => org.id === id) || null;
    if (id) localStorage.setItem('trail_org', id);
    else localStorage.removeItem('trail_org');
    orgSelectIds.forEach(selectId => {
      if ($(selectId)) $(selectId).value = id || '';
    });
  }

  function bindOrganization(selectId, callback) {
    $(selectId).onchange = async () => {
      setOrganization($(selectId).value);
      await callback();
    };
  }

  async function fillEventSelect(select, organizationId, desired) {
    const rows = await A.events(organizationId);
    select.innerHTML = rows.map(event =>
      `<option value="${event.id}">${A.esc(event.name)}</option>`
    ).join('') || '<option value="">ยังไม่มี Event</option>';
    const wanted = desired || localStorage.getItem('trail_event');
    if (rows.some(event => event.id === wanted)) select.value = wanted;
    if (select.value) localStorage.setItem('trail_event', select.value);
    return rows;
  }

  async function countRows(table, column, value) {
    const { count, error } = await db
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, value);
    if (error) throw error;
    return count || 0;
  }

  function deleteErrorMessage(error, fallback) {
    if (error?.code === '23503') {
      return 'ไม่สามารถลบได้ เพราะรายการนี้ถูกใช้งานในข้อมูลอื่นแล้ว กรุณาปิดใช้งานแทน';
    }
    if (error?.code === '42501') {
      return 'บัญชีนี้ไม่มีสิทธิ์ลบข้อมูลรายการนี้';
    }
    return error?.message || fallback || 'ลบข้อมูลไม่สำเร็จ';
  }

  async function openDelete(options) {
    pendingDelete = options;
    $('deleteTitle').textContent = options.title || 'ยืนยันการลบ';
    $('deleteDescription').innerHTML = options.description || '';
    $('deleteConfirmInput').value = '';
    $('deleteConfirmInput').placeholder = options.confirmText;
    $('deleteConfirmLabel').lastChild.textContent = '';
    $('deleteConfirmLabel').childNodes[0].textContent =
      `พิมพ์ “${options.confirmText}” เพื่อยืนยัน`;
    $('deleteSubmit').disabled = true;
    $('deleteSubmit').hidden = options.canDelete === false;
    $('deleteConfirmLabel').hidden = options.canDelete === false;
    $('deleteAlternative').hidden = !options.alternative;
    $('deleteAlternative').textContent = options.alternativeLabel || 'ปิดใช้งานแทน';

    $('deleteImpact').innerHTML = (options.impact || []).map(item => `
      <div class="impact-item">
        <strong>${Number(item.value || 0).toLocaleString()}</strong>
        <small>${A.esc(item.label)}</small>
      </div>
    `).join('');

    const blocked = $('deleteBlocked');
    blocked.hidden = !options.blockedReason;
    blocked.textContent = options.blockedReason || '';

    $('deleteDlg').showModal();
    if (options.canDelete !== false) $('deleteConfirmInput').focus();
  }

  $('deleteConfirmInput').oninput = event => {
    $('deleteSubmit').disabled =
      !pendingDelete || event.target.value.trim() !== pendingDelete.confirmText;
  };

  $('deleteForm').onsubmit = async event => {
    event.preventDefault();
    if (!pendingDelete || pendingDelete.canDelete === false) return;
    if ($('deleteConfirmInput').value.trim() !== pendingDelete.confirmText) return;

    $('deleteSubmit').disabled = true;
    A.loading(true);
    try {
      await pendingDelete.action();
      $('deleteDlg').close();
      A.toast('ลบข้อมูลเรียบร้อยแล้ว', 'ok');
      await pendingDelete.after?.();
    } catch (error) {
      A.toast(deleteErrorMessage(error), 'error');
    } finally {
      A.loading(false);
      $('deleteSubmit').disabled = false;
    }
  };

  $('deleteAlternative').onclick = async () => {
    if (!pendingDelete?.alternative) return;
    A.loading(true);
    try {
      await pendingDelete.alternative();
      $('deleteDlg').close();
      A.toast('ปิดใช้งานรายการแล้ว', 'ok');
      await pendingDelete.after?.();
    } catch (error) {
      A.toast(error.message || 'ดำเนินการไม่สำเร็จ', 'error');
    } finally {
      A.loading(false);
    }
  };

  // ------------------------------------------------------------------
  // ORGANIZATIONS
  // ------------------------------------------------------------------
  function renderOrganizations() {
    $('orgRows').innerHTML = A.orgs.length
      ? A.orgs.map(org => `
        <tr>
          <td><strong>${A.esc(org.name)}</strong></td>
          <td class="code">${A.esc(org.slug)}</td>
          <td>${A.esc(org.timezone)}</td>
          <td>${badge(org.status)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-org-edit="${org.id}">แก้ไข</button>
            <button class="btn btn-sm btn-outline-danger" data-org-delete="${org.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="5"><div class="empty">ยังไม่มีองค์กร</div></td></tr>';
  }

  function openOrganization(org = null) {
    $('orgForm').reset();
    $('orgId').value = org?.id || '';
    $('orgDlgTitle').textContent = org ? 'แก้ไของค์กร' : 'สร้างองค์กร';
    $('orgName').value = org?.name || '';
    $('orgSlug').value = org?.slug || '';
    $('orgTz').value = org?.timezone || 'Asia/Bangkok';
    $('orgStatus').value = org?.status || 'ACTIVE';
    $('orgSlug').dataset.edited = org ? '1' : '';
    $('orgDlg').showModal();
  }

  $('newOrg').onclick = () => openOrganization();
  $('orgName').oninput = event => {
    if (!$('orgId').value && !$('orgSlug').dataset.edited) {
      $('orgSlug').value = A.slug(event.target.value);
    }
  };
  $('orgSlug').oninput = event => {
    event.target.dataset.edited = '1';
  };

  $('orgForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('orgId').value;
    const payload = {
      name: $('orgName').value.trim(),
      slug: $('orgSlug').value.trim().toLowerCase(),
      timezone: $('orgTz').value.trim(),
      status: $('orgStatus').value
    };

    if (id) {
      const { error } = await db.from('organizations').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await db.rpc('create_organization', {
        p_name: payload.name,
        p_slug: payload.slug,
        p_timezone: payload.timezone
      });
      if (error) throw error;
      if (payload.status !== 'ACTIVE') {
        const { error: updateError } = await db
          .from('organizations')
          .update({ status: payload.status })
          .eq('id', data);
        if (updateError) throw updateError;
      }
      setOrganization(data);
    }

    $('orgDlg').close();
    await A.loadOrgs();
    if (id) setOrganization(id);
    refreshAllOrgSelects();
    renderOrganizations();
    A.toast('บันทึกองค์กรแล้ว', 'ok');
  };

  $('orgRows').onclick = async event => {
    const editId = event.target.dataset.orgEdit;
    const deleteId = event.target.dataset.orgDelete;

    if (editId) {
      openOrganization(A.orgs.find(org => org.id === editId));
      return;
    }

    if (deleteId) {
      const org = A.orgs.find(item => item.id === deleteId);
      const [eventsCount, runnersCount, scansCount] = await Promise.all([
        countRows('events', 'organization_id', deleteId),
        countRows('runners', 'organization_id', deleteId),
        countRows('scan_logs', 'organization_id', deleteId)
      ]);

      await openDelete({
        title: 'ลบองค์กรถาวร',
        confirmText: org.name,
        description:
          `องค์กร <strong>${A.esc(org.name)}</strong> และข้อมูลทั้งหมดภายในองค์กรจะถูกลบถาวร`,
        impact: [
          { label: 'Event', value: eventsCount },
          { label: 'นักวิ่ง', value: runnersCount },
          { label: 'รายการสแกน', value: scansCount }
        ],
        action: async () => {
          const { error } = await db.from('organizations').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: async () => {
          await A.loadOrgs();
          setOrganization(A.orgs[0]?.id || '');
          refreshAllOrgSelects();
          renderOrganizations();
        }
      });
    }
  };

  // ------------------------------------------------------------------
  // EVENTS
  // ------------------------------------------------------------------
  async function loadEventsPage() {
    state.events = await A.events($('eventOrg').value);
    renderEvents();
  }

  function renderEvents() {
    const query = $('eventSearch').value.toLowerCase();
    const status = $('eventStatusFilter').value;
    const rows = state.events.filter(event =>
      (!status || event.status === status) &&
      (!query ||
        event.name.toLowerCase().includes(query) ||
        (event.event_code || '').toLowerCase().includes(query))
    );

    $('eventRows').innerHTML = rows.length
      ? rows.map(event => `
        <tr>
          <td>
            <strong>${A.esc(event.name)}</strong>
            <small class="muted" style="display:block">${A.esc(event.event_code || event.slug)}</small>
          </td>
          <td>${A.fmt(event.race_date, false)}</td>
          <td>${A.esc(event.location_name || '—')}</td>
          <td>${badge(event.status)}</td>
          <td>${event.offline_enabled ? '✓' : '—'}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-event-edit="${event.id}">แก้ไข</button>
            <button class="btn btn-sm btn-primary" data-event-points="${event.id}">จัด CP</button>
            <button class="btn btn-sm btn-outline-danger" data-event-delete="${event.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6"><div class="empty">ยังไม่มี Event</div></td></tr>';
  }

  function openEvent(event = null) {
    $('eventForm').reset();
    $('eventId').value = event?.id || '';
    $('eventName').value = event?.name || '';
    $('eventSlug').value = event?.slug || '';
    $('eventCode').value = event?.event_code || '';
    $('raceDate').value = event?.race_date || '';
    $('eventTz').value = event?.timezone || 'Asia/Bangkok';
    $('eventLocation').value = event?.location_name || '';
    $('eventDetail').value = event?.location_detail || '';
    $('eventStatus').value = event?.status || 'DRAFT';
    $('eventOffline').checked = event?.offline_enabled ?? true;
    $('eventDlg').showModal();
  }

  $('newEvent').onclick = () =>
    A.activeOrg ? openEvent() : A.toast('กรุณาสร้างองค์กรก่อน', 'error');

  $('eventName').oninput = event => {
    if (!$('eventId').value) $('eventSlug').value = A.slug(event.target.value);
  };

  $('eventForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('eventId').value;
    const payload = {
      organization_id: $('eventOrg').value,
      name: $('eventName').value.trim(),
      slug: $('eventSlug').value.trim().toLowerCase(),
      event_code: $('eventCode').value.trim() || null,
      race_date: $('raceDate').value,
      timezone: $('eventTz').value.trim(),
      location_name: $('eventLocation').value.trim() || null,
      location_detail: $('eventDetail').value.trim() || null,
      status: $('eventStatus').value,
      offline_enabled: $('eventOffline').checked
    };
    if (!id) payload.created_by = A.user.id;

    const result = id
      ? await db.from('events').update(payload).eq('id', id)
      : await db.from('events').insert(payload);
    if (result.error) throw result.error;

    $('eventDlg').close();
    A.toast('บันทึก Event แล้ว', 'ok');
    await loadEventsPage();
  };

  $('eventRows').onclick = async event => {
    const editId = event.target.dataset.eventEdit;
    const pointId = event.target.dataset.eventPoints;
    const deleteId = event.target.dataset.eventDelete;

    if (editId) {
      openEvent(state.events.find(item => item.id === editId));
      return;
    }
    if (pointId) {
      localStorage.setItem('trail_event', pointId);
      $('pointEvent').value = pointId;
      showPage('points');
      return;
    }
    if (deleteId) {
      const row = state.events.find(item => item.id === deleteId);
      const [
        categoriesCount,
        runnersCount,
        pointsCount,
        scansCount,
        staffCount,
        devicesCount,
        resultsCount
      ] = await Promise.all([
        countRows('race_categories', 'event_id', deleteId),
        countRows('runners', 'event_id', deleteId),
        countRows('scan_points', 'event_id', deleteId),
        countRows('scan_logs', 'event_id', deleteId),
        countRows('staff_assignments', 'event_id', deleteId),
        countRows('devices', 'event_id', deleteId),
        countRows('race_results', 'event_id', deleteId)
      ]);

      await openDelete({
        title: 'ลบ Event ถาวร',
        confirmText: row.name,
        description:
          `Event <strong>${A.esc(row.name)}</strong> รวมถึงนักวิ่ง จุดสแกน เวลาและผลทั้งหมดจะถูกลบ`,
        impact: [
          { label: 'ประเภท', value: categoriesCount },
          { label: 'นักวิ่ง', value: runnersCount },
          { label: 'จุดสแกน', value: pointsCount },
          { label: 'รายการสแกน', value: scansCount },
          { label: 'เจ้าหน้าที่', value: staffCount },
          { label: 'อุปกรณ์', value: devicesCount },
          { label: 'ผลการแข่งขัน', value: resultsCount }
        ],
        action: async () => {
          const { error } = await db.from('events').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadEventsPage
      });
    }
  };

  $('eventSearch').oninput = renderEvents;
  $('eventStatusFilter').onchange = renderEvents;
  bindOrganization('eventOrg', loadEventsPage);

  // ------------------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------------------
  async function setupDashboard() {
    state.dashEvents = await fillEventSelect($('dashEvent'), $('dashOrg').value);
    await loadDashboard();
  }

  async function loadDashboard() {
    if (!$('dashEvent').options.length) await setupDashboard();
    const eventId = $('dashEvent').value;
    if (!eventId) {
      $('sTotal').textContent = '0';
      $('sStart').textContent = '0';
      $('sRun').textContent = '0';
      $('sFinish').textContent = '0';
      return;
    }

    localStorage.setItem('trail_event', eventId);

    const [runnersRes, pointsRes, scansRes, resultsRes] = await Promise.all([
      db.from('runners').select('id,status', { count: 'exact' }).eq('event_id', eventId),
      db.from('scan_points').select('id,name,point_type,display_order')
        .eq('event_id', eventId).eq('is_active', true).order('display_order'),
      db.from('scan_logs').select(
        'id,estimated_server_time,record_status,scan_action,runner_id,scan_point_id'
      ).eq('event_id', eventId).order('estimated_server_time', { ascending: false }).limit(80),
      db.from('race_results').select('runner_id,result_status').eq('event_id', eventId)
    ]);

    for (const result of [runnersRes, pointsRes, scansRes, resultsRes]) {
      if (result.error) throw result.error;
    }

    const runners = runnersRes.data || [];
    const points = pointsRes.data || [];
    const scans = scansRes.data || [];
    const results = resultsRes.data || [];

    $('sTotal').textContent = runnersRes.count ?? runners.length;
    $('sStart').textContent =
      new Set(scans.filter(item => item.scan_action === 'START').map(item => item.runner_id)).size;
    $('sRun').textContent =
      runners.filter(item => ['RUNNING', 'CHECKED_IN'].includes(item.status)).length;
    $('sFinish').textContent =
      results.filter(item =>
        ['FINISHER', 'LATE_FINISH', 'PENDING_REVIEW'].includes(item.result_status)
      ).length;

    const accepted = scans.filter(item => item.record_status === 'ACCEPTED');
    $('pointSummary').innerHTML = points.length
      ? `<div class="route-list">${points.map((point, index) => `
          <div class="route">
            <strong>${index + 1}</strong>
            <div>
              <strong>${A.esc(point.name)}</strong>
              <small class="muted" style="display:block">${point.point_type}</small>
            </div>
            <span class="badge info">
              ${new Set(accepted.filter(item => item.scan_point_id === point.id)
                .map(item => item.runner_id)).size} คน
            </span>
          </div>
        `).join('')}</div>`
      : '<div class="empty">ยังไม่มีจุดสแกน</div>';

    const runnerIds = [...new Set(scans.map(item => item.runner_id).filter(Boolean))];
    const pointMap = new Map(points.map(item => [item.id, item]));
    let runnerMap = new Map();

    if (runnerIds.length) {
      const { data, error } = await db
        .from('runners')
        .select('id,bib_number')
        .in('id', runnerIds);
      if (error) throw error;
      runnerMap = new Map((data || []).map(item => [item.id, item]));
    }

    $('scanLatest').innerHTML = scans.length
      ? scans.slice(0, 15).map(item => `
        <tr>
          <td>${A.fmt(item.estimated_server_time)}</td>
          <td class="code">${A.esc(runnerMap.get(item.runner_id)?.bib_number || '—')}</td>
          <td>${A.esc(pointMap.get(item.scan_point_id)?.name || '—')}</td>
          <td>${badge(item.record_status)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4"><div class="empty">ยังไม่มีข้อมูล</div></td></tr>';
  }

  $('dashRefresh').onclick = loadDashboard;
  $('dashEvent').onchange = loadDashboard;
  bindOrganization('dashOrg', setupDashboard);
  await setupDashboard();

  // ------------------------------------------------------------------
  // CATEGORIES
  // ------------------------------------------------------------------
  async function setupCategories() {
    state.catEvents = await fillEventSelect($('catEvent'), $('catOrg').value);
    await loadCategoriesPage();
  }

  async function loadCategoriesPage() {
    const eventId = $('catEvent').value;
    if (!eventId) {
      state.cats = [];
      renderCategories();
      return;
    }
    localStorage.setItem('trail_event', eventId);
    const { data, error } = await db
      .from('race_categories')
      .select('*')
      .eq('event_id', eventId)
      .order('sort_order')
      .order('name');
    if (error) throw error;
    state.cats = data || [];
    renderCategories();
  }

  function renderCategories() {
    $('catRows').innerHTML = state.cats.length
      ? state.cats.map(category => `
        <tr>
          <td>
            <strong>${A.esc(category.name)}</strong>
            <small class="muted" style="display:block">${A.esc(category.code)}</small>
          </td>
          <td>${category.distance_km ?? '—'} KM</td>
          <td>${badge(category.timing_mode)}</td>
          <td>${A.fmt(category.scheduled_start_at)}</td>
          <td>${category.actual_start_at
            ? `<strong>${A.fmt(category.actual_start_at)}</strong>`
            : '<span class="badge warning">ยังไม่ปล่อย</span>'}</td>
          <td>${A.fmt(category.cutoff_at)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-warning" data-cat-start="${category.id}">ปล่อยตัว</button>
            <button class="btn btn-sm btn-secondary" data-cat-edit="${category.id}">แก้ไข</button>
            <button class="btn btn-sm btn-outline-danger" data-cat-delete="${category.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="7"><div class="empty">ยังไม่มีประเภทการแข่งขัน</div></td></tr>';
  }

  function openCategory(category = null) {
    $('catForm').reset();
    $('catId').value = category?.id || '';
    $('catCode').value = category?.code || '';
    $('catName').value = category?.name || '';
    $('catDistance').value = category?.distance_km ?? '';
    $('catPrefix').value = category?.bib_prefix || '';
    $('catTiming').value = category?.timing_mode || 'GUN';
    $('catSort').value = category?.sort_order ?? 0;
    $('catScheduled').value = A.localInput(category?.scheduled_start_at);
    $('catCutoff').value = A.localInput(category?.cutoff_at);
    $('catActive').checked = category?.is_active ?? true;
    $('catDlg').showModal();
  }

  $('newCategory').onclick = () =>
    $('catEvent').value
      ? openCategory()
      : A.toast('กรุณาสร้าง Event ก่อน', 'error');

  $('catForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('catId').value;
    const selectedEvent = state.catEvents.find(item => item.id === $('catEvent').value);
    const payload = {
      organization_id: selectedEvent.organization_id,
      event_id: selectedEvent.id,
      code: $('catCode').value.trim().toUpperCase(),
      name: $('catName').value.trim(),
      distance_km: $('catDistance').value || null,
      bib_prefix: $('catPrefix').value.trim() || null,
      timing_mode: $('catTiming').value,
      scheduled_start_at: A.iso($('catScheduled').value),
      cutoff_at: A.iso($('catCutoff').value),
      sort_order: Number($('catSort').value || 0),
      is_active: $('catActive').checked
    };
    if (!id) payload.created_by = A.user.id;

    const result = id
      ? await db.from('race_categories').update(payload).eq('id', id)
      : await db.from('race_categories').insert(payload);
    if (result.error) throw result.error;

    $('catDlg').close();
    A.toast('บันทึกประเภทการแข่งขันแล้ว', 'ok');
    await loadCategoriesPage();
  };

  $('startForm').onsubmit = async event => {
    event.preventDefault();
    const { error } = await db.rpc('set_actual_start_time', {
      p_race_category_id: $('startCatId').value,
      p_actual_start_at: A.iso($('actualStart').value),
      p_reason: $('startReason').value.trim()
    });
    if (error) throw error;
    $('startDlg').close();
    A.toast('บันทึกเวลาปล่อยตัวจริงแล้ว', 'ok');
    await loadCategoriesPage();
  };

  $('catRows').onclick = async event => {
    const editId = event.target.dataset.catEdit;
    const startId = event.target.dataset.catStart;
    const deleteId = event.target.dataset.catDelete;

    if (editId) {
      openCategory(state.cats.find(item => item.id === editId));
      return;
    }
    if (startId) {
      $('startCatId').value = startId;
      $('actualStart').value = A.localInput(new Date());
      $('startReason').value = 'บันทึกเวลาปล่อยตัวจริง';
      $('startDlg').showModal();
      return;
    }
    if (deleteId) {
      const category = state.cats.find(item => item.id === deleteId);
      const [runnersCount, scansCount, resultsCount] = await Promise.all([
        countRows('runners', 'race_category_id', deleteId),
        countRows('scan_logs', 'race_category_id', deleteId),
        countRows('race_results', 'race_category_id', deleteId)
      ]);
      const used = runnersCount + scansCount + resultsCount > 0;

      await openDelete({
        title: 'ลบประเภทการแข่งขัน',
        confirmText: category.code,
        description: `ประเภท <strong>${A.esc(category.name)}</strong> จะถูกลบถาวร`,
        impact: [
          { label: 'นักวิ่ง', value: runnersCount },
          { label: 'รายการสแกน', value: scansCount },
          { label: 'ผลการแข่งขัน', value: resultsCount }
        ],
        canDelete: !used,
        blockedReason: used
          ? 'ประเภทนี้ถูกใช้งานแล้ว จึงลบไม่ได้ เพื่อป้องกันข้อมูลนักวิ่งและผลเสียหาย สามารถปิดใช้งานแทนได้'
          : '',
        alternative: used ? async () => {
          const { error } = await db
            .from('race_categories')
            .update({ is_active: false })
            .eq('id', deleteId);
          if (error) throw error;
        } : null,
        action: async () => {
          const { error } = await db.from('race_categories').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadCategoriesPage
      });
    }
  };

  $('catRefresh').onclick = loadCategoriesPage;
  $('catEvent').onchange = loadCategoriesPage;
  bindOrganization('catOrg', setupCategories);
  await setupCategories();

  // ------------------------------------------------------------------
  // SCAN POINTS
  // ------------------------------------------------------------------
  async function setupPoints() {
    state.pointEvents = await fillEventSelect($('pointEvent'), $('pointOrg').value);
    await loadPointsPage();
  }

  async function loadPointsPage() {
    const eventId = $('pointEvent').value;
    $('pointScanner').href = `../scanner/index.html?event=${encodeURIComponent(eventId || '')}`;

    if (!eventId) {
      state.points = [];
      state.pointCats = [];
      state.routes = [];
      renderPoints();
      return;
    }

    localStorage.setItem('trail_event', eventId);

    const [pointsRes, categoriesRes, routesRes] = await Promise.all([
      db.from('scan_points').select('*').eq('event_id', eventId)
        .order('display_order').order('created_at'),
      db.from('race_categories').select('*').eq('event_id', eventId)
        .eq('is_active', true).order('sort_order'),
      db.from('scan_point_categories').select('*').eq('event_id', eventId)
    ]);

    if (pointsRes.error) throw pointsRes.error;
    if (categoriesRes.error) throw categoriesRes.error;
    if (routesRes.error) throw routesRes.error;

    state.points = pointsRes.data || [];
    state.pointCats = categoriesRes.data || [];
    state.routes = routesRes.data || [];
    renderPoints();
  }

  function pointBadge(type) {
    return `<span class="badge ${type === 'START' ? 'success' : type === 'FINISH' ? 'danger' : 'info'}">${type}</span>`;
  }

  function renderPoints() {
    $('pointCount').textContent = `${state.points.length} จุด`;
    $('pointList').innerHTML = state.points.length
      ? `<div class="route-list">${state.points.map((point, index) => `
          <div class="route">
            <strong>${index + 1}</strong>
            <div>
              <strong>${A.esc(point.name)}</strong>
              <small class="muted" style="display:block">
                ${pointBadge(point.point_type)}
                ${A.esc(point.code)} • ${point.distance_km ?? 0} KM
                ${point.is_active ? '' : ' • ปิดใช้งาน'}
              </small>
            </div>
            <div class="row-actions">
              <button class="btn btn-sm btn-secondary" data-point-up="${point.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-sm btn-secondary" data-point-down="${point.id}" ${index === state.points.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn btn-sm btn-secondary" data-point-edit="${point.id}">แก้ไข</button>
              <button class="btn btn-sm btn-outline-danger" data-point-delete="${point.id}">ลบ</button>
            </div>
          </div>
        `).join('')}</div>`
      : '<div class="empty">ยังไม่มีจุดสแกน</div>';

    const oldCategory = $('routeCat').value;
    $('routeCat').innerHTML = state.pointCats.map(category =>
      `<option value="${category.id}">${A.esc(category.name)}</option>`
    ).join('') || '<option value="">ยังไม่มีประเภท</option>';
    if (state.pointCats.some(item => item.id === oldCategory)) $('routeCat').value = oldCategory;

    $('pointCatChecks').innerHTML = state.pointCats.length
      ? state.pointCats.map(category => `
        <div class="card" style="box-shadow:none">
          <div class="card-body" style="padding:11px">
            <label class="check">
              <input type="checkbox" data-route-check="${category.id}">
              ${A.esc(category.name)}
            </label>
            <div class="form-grid" style="margin-top:9px">
              <label>ลำดับเส้นทาง
                <input type="number" min="0" value="0" data-route-sequence="${category.id}">
              </label>
              <label>Cut-off เฉพาะระยะ
                <input type="datetime-local" data-route-cutoff="${category.id}">
              </label>
            </div>
          </div>
        </div>
      `).join('')
      : '<p class="muted">กรุณาสร้างประเภทการแข่งขันก่อน</p>';

    renderRoutePreview();
  }

  function renderRoutePreview() {
    const categoryId = $('routeCat').value;
    const pointMap = new Map(state.points.map(item => [item.id, item]));
    const rows = state.routes
      .filter(item => item.race_category_id === categoryId)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    $('routePreview').innerHTML = rows.length
      ? `<div class="route-list">${rows.map((route, index) => {
          const point = pointMap.get(route.scan_point_id);
          return `
            <div class="route">
              <strong>${index + 1}</strong>
              <div>
                <strong>${A.esc(point?.name || 'ไม่พบจุด')}</strong>
                <small class="muted" style="display:block">
                  ลำดับ ${route.sequence_no} ${route.is_required ? '• บังคับผ่าน' : ''}
                </small>
              </div>
              ${pointBadge(point?.point_type || 'CHECKPOINT')}
            </div>
          `;
        }).join('')}</div>`
      : '<div class="empty">ยังไม่ได้ผูกจุดกับประเภทนี้</div>';
  }

  function openPoint(point = null) {
    $('pointForm').reset();
    $('pointId').value = point?.id || '';
    $('pointType').value = point?.point_type || 'CHECKPOINT';
    $('pointCode').value =
      point?.code || `CP${state.points.filter(item => item.point_type === 'CHECKPOINT').length + 1}`;
    $('pointName').value = point?.name || '';
    $('pointOrder').value = point?.display_order ?? state.points.length;
    $('pointDistance').value = point?.distance_km ?? '';
    $('pointOpen').value = A.localInput(point?.scheduled_open_at);
    $('pointClose').value = A.localInput(point?.scheduled_close_at);
    $('pointCutoff').value = A.localInput(point?.default_cutoff_at);
    $('pointMode').value = point?.scan_mode || 'SINGLE';
    $('pointOffline').checked = point?.allow_offline ?? true;
    $('pointManual').checked = point?.allow_manual_entry ?? true;
    $('pointActive').checked = point?.is_active ?? true;
    $('pointDashboard').checked = point?.show_on_dashboard ?? true;

    $('pointDlg').showModal();

    const linkedRoutes = state.routes.filter(item => item.scan_point_id === point?.id);
    state.pointCats.forEach(category => {
      const route = linkedRoutes.find(item => item.race_category_id === category.id);
      const check = document.querySelector(`[data-route-check="${category.id}"]`);
      const sequence = document.querySelector(`[data-route-sequence="${category.id}"]`);
      const cutoff = document.querySelector(`[data-route-cutoff="${category.id}"]`);
      if (check) check.checked = !!route;
      if (sequence) sequence.value = route?.sequence_no ?? point?.display_order ?? state.points.length;
      if (cutoff) cutoff.value = A.localInput(route?.cutoff_at);
    });
  }

  async function movePoint(id, direction) {
    const index = state.points.findIndex(item => item.id === id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.points.length) return;

    const current = state.points[index];
    const target = state.points[targetIndex];

    const { error: firstError } = await db
      .from('scan_points')
      .update({ display_order: target.display_order })
      .eq('id', current.id);
    if (firstError) throw firstError;

    const { error: secondError } = await db
      .from('scan_points')
      .update({ display_order: current.display_order })
      .eq('id', target.id);
    if (secondError) throw secondError;

    await loadPointsPage();
  }

  $('newPoint').onclick = () =>
    $('pointEvent').value
      ? openPoint()
      : A.toast('กรุณาสร้าง Event ก่อน', 'error');

  $('pointForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('pointId').value;
    const selectedEvent = state.pointEvents.find(item => item.id === $('pointEvent').value);

    const payload = {
      organization_id: selectedEvent.organization_id,
      event_id: selectedEvent.id,
      point_type: $('pointType').value,
      code: $('pointCode').value.trim().toUpperCase(),
      name: $('pointName').value.trim(),
      display_order: Number($('pointOrder').value || 0),
      distance_km: $('pointDistance').value || null,
      scheduled_open_at: A.iso($('pointOpen').value),
      scheduled_close_at: A.iso($('pointClose').value),
      default_cutoff_at: A.iso($('pointCutoff').value),
      scan_mode: $('pointMode').value,
      allow_offline: $('pointOffline').checked,
      allow_manual_entry: $('pointManual').checked,
      is_active: $('pointActive').checked,
      show_on_dashboard: $('pointDashboard').checked
    };
    if (!id) payload.created_by = A.user.id;

    const result = id
      ? await db.from('scan_points').update(payload).eq('id', id).select().single()
      : await db.from('scan_points').insert(payload).select().single();
    if (result.error) throw result.error;

    const pointId = result.data.id;
    const { error: deleteRouteError } = await db
      .from('scan_point_categories')
      .delete()
      .eq('scan_point_id', pointId);
    if (deleteRouteError) throw deleteRouteError;

    const mappings = state.pointCats
      .filter(category =>
        document.querySelector(`[data-route-check="${category.id}"]`)?.checked
      )
      .map(category => ({
        organization_id: selectedEvent.organization_id,
        event_id: selectedEvent.id,
        scan_point_id: pointId,
        race_category_id: category.id,
        sequence_no: Number(
          document.querySelector(`[data-route-sequence="${category.id}"]`)?.value || 0
        ),
        is_required: true,
        cutoff_at: A.iso(
          document.querySelector(`[data-route-cutoff="${category.id}"]`)?.value
        )
      }));

    if (mappings.length) {
      const { error } = await db.from('scan_point_categories').insert(mappings);
      if (error) throw error;
    }

    $('pointDlg').close();
    A.toast('บันทึกจุดสแกนแล้ว', 'ok');
    await loadPointsPage();
  };

  $('pointList').onclick = async event => {
    const editId = event.target.dataset.pointEdit;
    const deleteId = event.target.dataset.pointDelete;
    const upId = event.target.dataset.pointUp;
    const downId = event.target.dataset.pointDown;

    if (editId) {
      openPoint(state.points.find(item => item.id === editId));
      return;
    }
    if (upId) {
      await movePoint(upId, -1);
      return;
    }
    if (downId) {
      await movePoint(downId, 1);
      return;
    }
    if (deleteId) {
      const point = state.points.find(item => item.id === deleteId);
      const [scansCount, staffCount, devicesCount] = await Promise.all([
        countRows('scan_logs', 'scan_point_id', deleteId),
        countRows('staff_assignments', 'scan_point_id', deleteId),
        countRows('devices', 'scan_point_id', deleteId)
      ]);
      const used = scansCount > 0;

      await openDelete({
        title: 'ลบจุดสแกน',
        confirmText: point.code,
        description: `จุด <strong>${A.esc(point.name)}</strong> จะถูกลบออกจากเส้นทาง`,
        impact: [
          { label: 'รายการสแกน', value: scansCount },
          { label: 'เจ้าหน้าที่', value: staffCount },
          { label: 'อุปกรณ์', value: devicesCount }
        ],
        canDelete: !used,
        blockedReason: used
          ? 'จุดนี้มีประวัติการสแกนแล้ว จึงลบไม่ได้ สามารถปิดใช้งานเพื่อเก็บประวัติเดิมไว้'
          : '',
        alternative: used ? async () => {
          const { error } = await db
            .from('scan_points')
            .update({ is_active: false, show_on_dashboard: false })
            .eq('id', deleteId);
          if (error) throw error;
        } : null,
        action: async () => {
          const { error } = await db.from('scan_points').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadPointsPage
      });
    }
  };

  $('routeCat').onchange = renderRoutePreview;
  $('pointEvent').onchange = loadPointsPage;
  bindOrganization('pointOrg', setupPoints);
  await setupPoints();

  // ------------------------------------------------------------------
  // RUNNERS
  // ------------------------------------------------------------------
  async function setupRunners() {
    state.runnerEvents = await fillEventSelect($('runnerEvent'), $('runnerOrg').value);
    await loadRunnersPage();
  }

  async function loadRunnersPage() {
    const eventId = $('runnerEvent').value;
    if (!eventId) {
      state.runnerCats = [];
      state.runners = [];
      renderRunners();
      return;
    }

    localStorage.setItem('trail_event', eventId);
    const [categoriesRes, runnersRes] = await Promise.all([
      db.from('race_categories').select('*').eq('event_id', eventId).order('sort_order'),
      db.from('runners').select('*').eq('event_id', eventId).order('bib_number')
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (runnersRes.error) throw runnersRes.error;

    state.runnerCats = categoriesRes.data || [];
    state.runners = runnersRes.data || [];

    const oldFilter = $('runnerCatFilter').value;
    $('runnerCatFilter').innerHTML =
      '<option value="">ทั้งหมด</option>' +
      state.runnerCats.map(category =>
        `<option value="${category.id}">${A.esc(category.name)}</option>`
      ).join('');
    if (state.runnerCats.some(item => item.id === oldFilter)) {
      $('runnerCatFilter').value = oldFilter;
    }

    $('runnerCat').innerHTML = state.runnerCats.map(category =>
      `<option value="${category.id}">${A.esc(category.name)}</option>`
    ).join('');

    renderRunners();
  }

  function renderRunners() {
    const query = $('runnerSearch').value.trim().toLowerCase();
    const categoryId = $('runnerCatFilter').value;
    const categoryMap = new Map(state.runnerCats.map(item => [item.id, item]));

    const rows = state.runners.filter(runner =>
      (!categoryId || runner.race_category_id === categoryId) &&
      (!query ||
        runner.bib_number.toLowerCase().includes(query) ||
        `${runner.first_name} ${runner.last_name}`.toLowerCase().includes(query))
    );

    $('runnerRows').innerHTML = rows.length
      ? rows.map(runner => `
        <tr>
          <td class="code">${A.esc(runner.bib_number)}</td>
          <td><strong>${A.esc(
            runner.display_name || `${runner.first_name} ${runner.last_name}`
          )}</strong></td>
          <td>${A.esc(categoryMap.get(runner.race_category_id)?.name || '—')}</td>
          <td>${badge(runner.status)}</td>
          <td class="code">${A.esc(runner.qr_token)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-runner-edit="${runner.id}">แก้ไข / QR</button>
            <button class="btn btn-sm btn-outline-danger" data-runner-delete="${runner.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6"><div class="empty">ยังไม่มีนักวิ่ง</div></td></tr>';
  }

  function renderQr(token) {
    $('qrPreview').innerHTML = '';
    if (window.QRCode && token) {
      new QRCode($('qrPreview'), {
        text: `R:${token}`,
        width: 160,
        height: 160,
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }

  function openRunner(runner = null) {
    $('runnerForm').reset();
    $('runnerId').value = runner?.id || '';
    $('bib').value = runner?.bib_number || '';
    $('runnerCat').value = runner?.race_category_id || state.runnerCats[0]?.id || '';
    $('firstName').value = runner?.first_name || '';
    $('lastName').value = runner?.last_name || '';
    $('displayName').value = runner?.display_name || '';
    $('gender').value = runner?.gender || '';
    $('ageGroup').value = runner?.age_group || '';
    $('runnerStatus').value = runner?.status || 'REGISTERED';
    $('qrToken').value = runner?.qr_token || A.token();
    renderQr($('qrToken').value);
    $('runnerDlg').showModal();
  }

  $('newRunner').onclick = () =>
    state.runnerCats.length
      ? openRunner()
      : A.toast('สร้างประเภทการแข่งขันก่อน', 'error');

  $('runnerForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('runnerId').value;
    const selectedEvent = state.runnerEvents.find(item => item.id === $('runnerEvent').value);
    const payload = {
      organization_id: selectedEvent.organization_id,
      event_id: selectedEvent.id,
      race_category_id: $('runnerCat').value,
      bib_number: $('bib').value.trim().toUpperCase(),
      first_name: $('firstName').value.trim(),
      last_name: $('lastName').value.trim(),
      display_name: $('displayName').value.trim() || null,
      gender: $('gender').value || null,
      age_group: $('ageGroup').value.trim() || null,
      status: $('runnerStatus').value,
      qr_token: $('qrToken').value.trim().toUpperCase()
    };
    if (!id) payload.created_by = A.user.id;

    const result = id
      ? await db.from('runners').update(payload).eq('id', id)
      : await db.from('runners').insert(payload);
    if (result.error) throw result.error;

    $('runnerDlg').close();
    A.toast('บันทึกนักวิ่งแล้ว', 'ok');
    await loadRunnersPage();
  };

  $('runnerRows').onclick = async event => {
    const editId = event.target.dataset.runnerEdit;
    const deleteId = event.target.dataset.runnerDelete;

    if (editId) {
      openRunner(state.runners.find(item => item.id === editId));
      return;
    }

    if (deleteId) {
      const runner = state.runners.find(item => item.id === deleteId);
      const [scansCount, resultsCount] = await Promise.all([
        countRows('scan_logs', 'runner_id', deleteId),
        countRows('race_results', 'runner_id', deleteId)
      ]);
      const used = scansCount + resultsCount > 0;

      await openDelete({
        title: 'ลบนักวิ่ง',
        confirmText: runner.bib_number,
        description:
          `นักวิ่ง BIB <strong>${A.esc(runner.bib_number)}</strong> ` +
          `${A.esc(runner.display_name || `${runner.first_name} ${runner.last_name}`)} จะถูกลบ`,
        impact: [
          { label: 'รายการสแกน', value: scansCount },
          { label: 'ผลการแข่งขัน', value: resultsCount }
        ],
        canDelete: !used,
        blockedReason: used
          ? 'นักวิ่งคนนี้มีประวัติการสแกนหรือผลการแข่งขันแล้ว จึงลบไม่ได้ สามารถเปลี่ยนสถานะเป็น CANCELLED แทน'
          : '',
        alternative: used ? async () => {
          const { error } = await db
            .from('runners')
            .update({ status: 'CANCELLED' })
            .eq('id', deleteId);
          if (error) throw error;
        } : null,
        alternativeLabel: 'เปลี่ยนเป็น CANCELLED',
        action: async () => {
          const { error } = await db.from('runners').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadRunnersPage
      });
    }
  };

  $('qrToken').oninput = event => renderQr(event.target.value);
  $('runnerSearch').oninput = renderRunners;
  $('runnerCatFilter').onchange = renderRunners;
  $('runnerEvent').onchange = loadRunnersPage;
  bindOrganization('runnerOrg', setupRunners);

  $('sampleCsv').onclick = () => A.download(
    'sample-runners.csv',
    '\uFEFFbib_number,category_code,first_name,last_name,display_name,gender,age_group,qr_token\n' +
    'T25-001,T25,สมชาย,ใจดี,สมชาย ใจดี,MALE,30-39,\n',
    'text/csv;charset=utf-8'
  );

  $('importCsv').onclick = () => $('csvFile').click();

  $('csvFile').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const lines = (await file.text()).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const headers = lines.shift().split(',').map(item => item.trim().toLowerCase());
    const categoryMap = new Map(
      state.runnerCats.map(category => [category.code.toUpperCase(), category])
    );
    const selectedEvent = state.runnerEvents.find(item => item.id === $('runnerEvent').value);
    const existing = new Set(state.runners.map(item => item.bib_number.toUpperCase()));
    const inserts = [];
    const skipped = [];

    lines.forEach((line, index) => {
      const values = line.split(',');
      const row = Object.fromEntries(
        headers.map((header, valueIndex) => [header, (values[valueIndex] || '').trim()])
      );
      const bib = (row.bib_number || row.bib || '').toUpperCase();
      const category = categoryMap.get(
        (row.category_code || row.category || '').toUpperCase()
      );

      if (!bib || existing.has(bib) || !category || !row.first_name || !row.last_name) {
        skipped.push(index + 2);
        return;
      }

      existing.add(bib);
      inserts.push({
        organization_id: selectedEvent.organization_id,
        event_id: selectedEvent.id,
        race_category_id: category.id,
        bib_number: bib,
        qr_token: (row.qr_token || A.token()).toUpperCase(),
        first_name: row.first_name,
        last_name: row.last_name,
        display_name: row.display_name || null,
        gender: row.gender || null,
        age_group: row.age_group || null,
        status: 'REGISTERED',
        created_by: A.user.id
      });
    });

    for (let index = 0; index < inserts.length; index += 200) {
      const { error } = await db.from('runners').insert(inserts.slice(index, index + 200));
      if (error) throw error;
    }

    A.toast(
      `นำเข้า ${inserts.length} คน${skipped.length ? ` ข้าม ${skipped.length} แถว` : ''}`,
      'ok'
    );
    event.target.value = '';
    await loadRunnersPage();
  };

  await setupRunners();

  // ------------------------------------------------------------------
  // STAFF
  // ------------------------------------------------------------------
  async function loadMembers() {
    if (!$('staffOrg').value) {
      state.members = [];
      state.profiles = new Map();
      return;
    }

    const { data, error } = await db
      .from('organization_members')
      .select('user_id,role_code,status')
      .eq('organization_id', $('staffOrg').value)
      .eq('status', 'ACTIVE');
    if (error) throw error;

    state.members = data || [];
    state.profiles = new Map();
    const ids = state.members.map(item => item.user_id);

    if (ids.length) {
      const { data: profiles, error: profileError } = await db
        .from('profiles')
        .select('id,display_name')
        .in('id', ids);
      if (profileError) throw profileError;
      state.profiles = new Map((profiles || []).map(item => [item.id, item]));
    }
  }

  async function setupStaff() {
    await loadMembers();
    state.staffEvents = await fillEventSelect($('staffEvent'), $('staffOrg').value);
    await loadStaffPage();
  }

  async function loadStaffPage() {
    const eventId = $('staffEvent').value;
    if (!eventId) {
      state.staffPoints = [];
      state.assignments = [];
      renderStaff();
      return;
    }

    const [pointsRes, assignmentsRes] = await Promise.all([
      db.from('scan_points').select('*').eq('event_id', eventId).order('display_order'),
      db.from('staff_assignments').select('*').eq('event_id', eventId)
        .order('created_at', { ascending: false })
    ]);

    if (pointsRes.error) throw pointsRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    state.staffPoints = pointsRes.data || [];
    state.assignments = assignmentsRes.data || [];

    $('staffPointFilter').innerHTML =
      '<option value="">ทุกจุด</option>' +
      state.staffPoints.map(point =>
        `<option value="${point.id}">${A.esc(point.name)}</option>`
      ).join('');

    $('staffPoint').innerHTML = state.staffPoints.map(point =>
      `<option value="${point.id}">${A.esc(point.name)}</option>`
    ).join('');

    $('staffUser').innerHTML = state.members.map(member =>
      `<option value="${member.user_id}">${A.esc(
        state.profiles.get(member.user_id)?.display_name || member.user_id
      )}</option>`
    ).join('');

    renderStaff();
  }

  function renderStaff() {
    const pointId = $('staffPointFilter').value;
    const active = $('staffActiveFilter').value;
    const pointMap = new Map(state.staffPoints.map(item => [item.id, item]));

    const rows = state.assignments.filter(assignment =>
      (!pointId || assignment.scan_point_id === pointId) &&
      (!active || String(Number(assignment.is_active)) === active)
    );

    $('staffRows').innerHTML = rows.length
      ? rows.map(assignment => `
        <tr>
          <td><strong>${A.esc(
            state.profiles.get(assignment.user_id)?.display_name || assignment.user_id
          )}</strong></td>
          <td>${badge(assignment.role_code)}</td>
          <td>${A.esc(pointMap.get(assignment.scan_point_id)?.name || '—')}</td>
          <td>${assignment.can_manual_entry ? '✓' : '—'}</td>
          <td>${assignment.can_override_warning ? '✓' : '—'}</td>
          <td>${badge(assignment.is_active ? 'ACTIVE' : 'DISABLED')}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-staff-edit="${assignment.id}">แก้ไข</button>
            <button class="btn btn-sm btn-outline-danger" data-staff-delete="${assignment.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="7"><div class="empty">ยังไม่มีเจ้าหน้าที่</div></td></tr>';
  }

  function openStaff(assignment = null) {
    $('staffForm').reset();
    $('assignId').value = assignment?.id || '';
    $('staffUser').value = assignment?.user_id || state.members[0]?.user_id || '';
    $('staffPoint').value = assignment?.scan_point_id || state.staffPoints[0]?.id || '';
    $('staffRole').value = assignment?.role_code || 'CP_STAFF';
    $('staffManual').checked = assignment?.can_manual_entry ?? false;
    $('staffOverride').checked = assignment?.can_override_warning ?? false;
    $('staffActive').checked = assignment?.is_active ?? true;
    $('staffDlg').showModal();
  }

  $('newStaff').onclick = () =>
    state.staffPoints.length && state.members.length
      ? openStaff()
      : A.toast('ต้องมีสมาชิกองค์กรและจุดสแกนก่อน', 'error');

  $('staffForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('assignId').value;
    const selectedEvent = state.staffEvents.find(item => item.id === $('staffEvent').value);
    const payload = {
      organization_id: selectedEvent.organization_id,
      event_id: selectedEvent.id,
      user_id: $('staffUser').value,
      scan_point_id: $('staffPoint').value,
      role_code: $('staffRole').value,
      can_manual_entry: $('staffManual').checked,
      can_override_warning: $('staffOverride').checked,
      is_active: $('staffActive').checked
    };
    if (!id) payload.created_by = A.user.id;

    const result = id
      ? await db.from('staff_assignments').update(payload).eq('id', id)
      : await db.from('staff_assignments').insert(payload);
    if (result.error) throw result.error;

    $('staffDlg').close();
    A.toast('บันทึกเจ้าหน้าที่แล้ว', 'ok');
    await loadStaffPage();
  };

  $('staffRows').onclick = async event => {
    const editId = event.target.dataset.staffEdit;
    const deleteId = event.target.dataset.staffDelete;

    if (editId) {
      openStaff(state.assignments.find(item => item.id === editId));
      return;
    }

    if (deleteId) {
      const assignment = state.assignments.find(item => item.id === deleteId);
      const name =
        state.profiles.get(assignment.user_id)?.display_name || assignment.user_id;
      const pointName =
        state.staffPoints.find(item => item.id === assignment.scan_point_id)?.name || 'ทุกจุด';

      await openDelete({
        title: 'ลบการมอบหมายเจ้าหน้าที่',
        confirmText: name,
        description:
          `ลบสิทธิ์ <strong>${A.esc(assignment.role_code)}</strong> ของ ` +
          `<strong>${A.esc(name)}</strong> จากจุด ${A.esc(pointName)}`,
        impact: [],
        action: async () => {
          const { error } = await db.from('staff_assignments').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadStaffPage
      });
    }
  };

  $('staffPointFilter').onchange = renderStaff;
  $('staffActiveFilter').onchange = renderStaff;
  $('staffEvent').onchange = loadStaffPage;
  bindOrganization('staffOrg', setupStaff);
  await setupStaff();

  // ------------------------------------------------------------------
  // DEVICES
  // ------------------------------------------------------------------
  async function setupDevices() {
    state.deviceEvents = await fillEventSelect($('deviceEvent'), $('deviceOrg').value);
    await loadDevicesPage();
  }

  async function loadDevicesPage() {
    const eventId = $('deviceEvent').value;
    if (!eventId) {
      state.devicePoints = [];
      state.devices = [];
      renderDevices();
      return;
    }

    localStorage.setItem('trail_event', eventId);

    const [pointsRes, devicesRes] = await Promise.all([
      db.from('scan_points').select('id,name,code').eq('event_id', eventId).order('display_order'),
      db.from('devices').select('*').eq('event_id', eventId).order('device_code')
    ]);

    if (pointsRes.error) throw pointsRes.error;
    if (devicesRes.error) throw devicesRes.error;

    state.devicePoints = pointsRes.data || [];
    state.devices = devicesRes.data || [];

    const pointOptions = state.devicePoints.map(point =>
      `<option value="${point.id}">${A.esc(point.name)}</option>`
    ).join('');

    $('devicePointFilter').innerHTML =
      '<option value="">ทุกจุด</option>' + pointOptions;
    $('devicePoint').innerHTML =
      '<option value="">ไม่ผูกจุด</option>' + pointOptions;

    renderDevices();
  }

  function renderDevices() {
    const pointId = $('devicePointFilter').value;
    const status = $('deviceStatusFilter').value;
    const pointMap = new Map(state.devicePoints.map(item => [item.id, item]));

    const rows = state.devices.filter(device =>
      (!pointId || device.scan_point_id === pointId) &&
      (!status || device.status === status)
    );

    $('deviceRows').innerHTML = rows.length
      ? rows.map(device => `
        <tr>
          <td class="code">${A.esc(device.device_code)}</td>
          <td>${A.esc(device.device_name || '—')}</td>
          <td>${A.esc(pointMap.get(device.scan_point_id)?.name || 'ไม่ผูกจุด')}</td>
          <td>${badge(device.status)}</td>
          <td>${A.fmt(device.last_seen_at)}</td>
          <td class="row-actions">
            <button class="btn btn-sm btn-secondary" data-device-edit="${device.id}">แก้ไข</button>
            <button class="btn btn-sm btn-outline-danger" data-device-delete="${device.id}">ลบ</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6"><div class="empty">ยังไม่มีอุปกรณ์ Scanner</div></td></tr>';
  }

  function openDevice(device = null) {
    $('deviceForm').reset();
    $('deviceId').value = device?.id || '';
    $('deviceCode').value = device?.device_code || '';
    $('deviceName').value = device?.device_name || '';
    $('devicePoint').value = device?.scan_point_id || '';
    $('deviceStatus').value = device?.status || 'ACTIVE';
    $('deviceOffset').value = device?.server_time_offset_ms ?? 0;
    $('deviceDlg').showModal();
  }

  $('newDevice').onclick = () =>
    $('deviceEvent').value
      ? openDevice()
      : A.toast('กรุณาสร้าง Event ก่อน', 'error');

  $('deviceForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('deviceId').value;
    const selectedEvent = state.deviceEvents.find(item => item.id === $('deviceEvent').value);
    const payload = {
      organization_id: selectedEvent.organization_id,
      event_id: selectedEvent.id,
      scan_point_id: $('devicePoint').value || null,
      device_code: $('deviceCode').value.trim().toUpperCase(),
      device_name: $('deviceName').value.trim() || null,
      status: $('deviceStatus').value,
      server_time_offset_ms: Number($('deviceOffset').value || 0)
    };

    const result = id
      ? await db.from('devices').update(payload).eq('id', id)
      : await db.from('devices').insert(payload);
    if (result.error) throw result.error;

    $('deviceDlg').close();
    A.toast('บันทึกอุปกรณ์แล้ว', 'ok');
    await loadDevicesPage();
  };

  $('deviceRows').onclick = async event => {
    const editId = event.target.dataset.deviceEdit;
    const deleteId = event.target.dataset.deviceDelete;

    if (editId) {
      openDevice(state.devices.find(item => item.id === editId));
      return;
    }

    if (deleteId) {
      const device = state.devices.find(item => item.id === deleteId);
      const scansCount = await countRows('scan_logs', 'device_id', deleteId);

      await openDelete({
        title: 'ลบอุปกรณ์ Scanner',
        confirmText: device.device_code,
        description:
          `อุปกรณ์ <strong>${A.esc(device.device_code)}</strong> จะถูกลบ ` +
          'รายการสแกนเดิมจะยังอยู่ แต่ช่องอุปกรณ์จะถูกตั้งเป็นว่าง',
        impact: [{ label: 'รายการสแกนเดิม', value: scansCount }],
        action: async () => {
          const { error } = await db.from('devices').delete().eq('id', deleteId);
          if (error) throw error;
        },
        after: loadDevicesPage
      });
    }
  };

  $('devicePointFilter').onchange = renderDevices;
  $('deviceStatusFilter').onchange = renderDevices;
  $('deviceEvent').onchange = loadDevicesPage;
  bindOrganization('deviceOrg', setupDevices);
  await setupDevices();

  // ------------------------------------------------------------------
  // RESULTS
  // ------------------------------------------------------------------
  async function setupResults() {
    state.resultEvents = await fillEventSelect($('resultEvent'), $('resultOrg').value);
    await loadResultsPage();
  }

  async function loadResultsPage() {
    const eventId = $('resultEvent').value;
    if (!eventId) {
      state.resultCats = [];
      state.results = [];
      renderResults();
      return;
    }

    const [categoriesRes, resultsRes, runnersRes] = await Promise.all([
      db.from('race_categories').select('*').eq('event_id', eventId).order('sort_order'),
      db.from('race_results').select('*').eq('event_id', eventId)
        .order('elapsed_seconds', { ascending: true, nullsFirst: false }),
      db.from('runners').select('id,bib_number,display_name,first_name,last_name')
        .eq('event_id', eventId)
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (resultsRes.error) throw resultsRes.error;
    if (runnersRes.error) throw runnersRes.error;

    state.resultCats = categoriesRes.data || [];
    state.results = resultsRes.data || [];
    state.resultRunners = new Map((runnersRes.data || []).map(item => [item.id, item]));

    const oldCategory = $('resultCat').value;
    $('resultCat').innerHTML =
      '<option value="">ทั้งหมด</option>' +
      state.resultCats.map(category =>
        `<option value="${category.id}">${A.esc(category.name)}</option>`
      ).join('');
    if (state.resultCats.some(item => item.id === oldCategory)) {
      $('resultCat').value = oldCategory;
    }

    renderResults();
  }

  function filteredResults() {
    const category = $('resultCat').value;
    const status = $('resultStatus').value;
    return state.results.filter(result =>
      (!category || result.race_category_id === category) &&
      (!status || result.result_status === status)
    );
  }

  function renderResults() {
    const categoryMap = new Map(state.resultCats.map(item => [item.id, item]));
    let rank = 0;

    $('resultRows').innerHTML = filteredResults().length
      ? filteredResults().map(result => {
          const runner = state.resultRunners.get(result.runner_id);
          const ranked = ['FINISHER', 'LATE_FINISH'].includes(result.result_status);
          if (ranked) rank += 1;

          return `
            <tr>
              <td>${ranked ? rank : '—'}</td>
              <td class="code">${A.esc(runner?.bib_number || '—')}</td>
              <td>${A.esc(
                runner?.display_name || `${runner?.first_name || ''} ${runner?.last_name || ''}`
              )}</td>
              <td>${A.esc(categoryMap.get(result.race_category_id)?.name || '—')}</td>
              <td>${A.fmt(result.individual_start_at || result.official_start_at)}</td>
              <td>${A.fmt(result.finish_at)}</td>
              <td class="code">${duration(result.elapsed_seconds)}</td>
              <td>${result.missing_required_points}</td>
              <td>${badge(result.result_status)}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="9"><div class="empty">ยังไม่มีผลการแข่งขัน</div></td></tr>';
  }

  $('resultRefresh').onclick = loadResultsPage;
  $('resultCat').onchange = renderResults;
  $('resultStatus').onchange = renderResults;

  $('exportResults').onclick = () => {
    const categoryMap = new Map(state.resultCats.map(item => [item.id, item]));
    const lines = [[
      'bib', 'name', 'category', 'official_start', 'individual_start',
      'finish', 'elapsed_seconds', 'missing_points', 'status'
    ].map(A.csv).join(',')];

    filteredResults().forEach(result => {
      const runner = state.resultRunners.get(result.runner_id);
      lines.push([
        runner?.bib_number,
        runner?.display_name || `${runner?.first_name || ''} ${runner?.last_name || ''}`,
        categoryMap.get(result.race_category_id)?.name,
        result.official_start_at,
        result.individual_start_at,
        result.finish_at,
        result.elapsed_seconds,
        result.missing_required_points,
        result.result_status
      ].map(A.csv).join(','));
    });

    A.download(
      'race-results.csv',
      '\uFEFF' + lines.join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  $('resultEvent').onchange = loadResultsPage;
  bindOrganization('resultOrg', setupResults);
  await setupResults();

  // Initial setup
  await loadEventsPage();
  renderOrganizations();

  const initialPage =
    location.hash.slice(1) && pageMeta[location.hash.slice(1)]
      ? location.hash.slice(1)
      : 'dashboard';
  showPage(initialPage);
})();
