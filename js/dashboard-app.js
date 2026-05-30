// dashboard-app.js
// Handles Auth flow and Dashboard UI State — powered by Supabase

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const authView = document.getElementById('authView');
  const dashboardView = document.getElementById('dashboardView');
  const adminView = document.getElementById('adminView');

  // Dashboard Card Elements
  const logoutBtn = document.getElementById('logoutBtn');
  const cardName = document.getElementById('cardName');
  const cardId = document.getElementById('cardId');
  const cardJoinedDate = document.getElementById('cardJoinedDate');

  // Initialize state
  checkAuthState();

  // Sync state on OAuth redirect / auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('onAuthStateChange event:', event, session);
    if (session && session.user) {
      const email = session.user.email;
      if (!email) return;

      const { data: member, error } = await supabase
        .from('members')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error('Error verifying member on Google Sign-In:', error.message);
        return;
      }

      if (!member) {
        const uniqueId = Math.floor(1000 + Math.random() * 9000).toString();
        const fullName = session.user.user_metadata?.full_name || 'Google User';
        const fname = fullName.split(' ')[0] || 'Google';
        const lname = fullName.split(' ').slice(1).join(' ') || 'User';

        const insertPayload = {
          fname,
          lname,
          email,
          member_id: uniqueId
        };

        const { error: insertError } = await supabase.from('members').insert([insertPayload]);
        if (insertError) {
          console.error('Auto-registration insert failed on Google Sign-In:', insertError.message);
          return;
        }

        // Send welcome email on Google registration
        fetch('/api/send-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: fullName })
        }).catch(err => console.error('Failed to send welcome email:', err));
      }

      localStorage.setItem('sspk_session', JSON.stringify({ role: 'user', identifier: email }));
      checkAuthState();
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('sspk_session');
      checkAuthState();
    }
  });

  function checkAuthState() {
    const session = JSON.parse(localStorage.getItem('sspk_session'));
    if (session) {
      if (session.role === 'admin') {
        showView(adminView);
        renderAdminDashboard();
      } else {
        showView(dashboardView);
        renderMembershipCard(session);
      }
    } else {
      window.location.href = 'login.html';
    }
  }

  function showView(view) {
    if (authView) authView.classList.add('hidden');
    dashboardView.classList.add('hidden');
    adminView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  logoutBtn?.addEventListener('click', async () => {
    localStorage.removeItem('sspk_session');
    await supabase.auth.signOut();
    checkAuthState();
  });

  document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('sspk_session');
    checkAuthState();
  });

  // ============================================================
  // RENDER MEMBERSHIP CARD — loads from Supabase
  // ============================================================
  function formatJoinedDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  async function renderMembershipCard(session) {
    if (!session || !session.identifier) return;

    const isEmail = session.identifier.includes('@');
    let query = supabase.from('members').select('fname, lname, member_id, registered_at');
    if (isEmail) {
      query = query.eq('email', session.identifier);
    } else {
      query = query.eq('phone', session.identifier);
    }

    const { data, error } = await query.maybeSingle();

    if (error) { console.error('Card render error:', error); return; }
    if (data) {
      cardName.textContent = data.fname + ' ' + data.lname;
      cardId.textContent = data.member_id;
      if (cardJoinedDate) {
        cardJoinedDate.textContent = formatJoinedDate(data.registered_at);
      }
    }
  }

  // ============================================================
  // ADMIN DASHBOARD
  // ============================================================
  async function renderAdminDashboard() {
    await loadCategories();
    renderAdminUsers();
    renderAdminEvents();
    renderAdminCategories();
    renderAdminGallery();
    populateGalleryEventDropdown();
  }

  async function renderAdminUsers() {
    const adminList = document.getElementById('adminUserList');
    if (!adminList) return;
    adminList.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading members...</p>';

    const { data, error } = await supabase
      .from('members')
      .select('fname, lname, phone, email, member_id, place, district')
      .order('registered_at', { ascending: false });

    if (error) { adminList.innerHTML = '<p style="color:red;">Error loading members.</p>'; return; }

    if (!data || data.length === 0) {
      adminList.innerHTML = '<p class="text-muted">No members registered yet.</p>';
      return;
    }

    adminList.innerHTML = '';
    data.forEach(u => {
      const div = document.createElement('div');
      div.className = 'admin-user-row';
      div.innerHTML = `
        <div class="user-info">
          <strong>${u.fname} ${u.lname}</strong> (ID: ${u.member_id})<br>
          <small>${u.phone} &middot; ${u.email || 'No Email'} &middot; ${u.place || 'No Place'} &middot; ${u.district || 'No District'}</small>
        </div>
      `;
      adminList.appendChild(div);
    });
  }

  // ============================================================
  // EVENT MANAGEMENT (Supabase CRUD)
  // ============================================================
  const addEventForm = document.getElementById('addEventForm');
  const showAddEventBtn = document.getElementById('showAddEventBtn');
  const cancelEventBtn = document.getElementById('cancelEventBtn');
  const adminEventList = document.getElementById('adminEventList');

  showAddEventBtn?.addEventListener('click', () => {
    addEventForm.reset();
    document.getElementById('eventIdInput').value = '';
    addEventForm.classList.remove('hidden');
    showAddEventBtn.classList.add('hidden');
  });

  cancelEventBtn?.addEventListener('click', () => {
    addEventForm.classList.add('hidden');
    showAddEventBtn.classList.remove('hidden');
  });

  async function renderAdminEvents() {
    if (!adminEventList) return;
    adminEventList.innerHTML = '<p style="color:var(--muted); font-size:13px;">Loading events...</p>';

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (error) { adminEventList.innerHTML = '<p style="color:red;">Error loading events.</p>'; return; }
    if (!data || data.length === 0) {
      adminEventList.innerHTML = '<p class="text-muted" style="font-size:14px;">No events found.</p>';
      return;
    }

    adminEventList.innerHTML = '';
    data.forEach(evt => {
      const div = document.createElement('div');
      div.style = 'padding:12px; border:1px solid var(--border); border-radius:6px; display:flex; justify-content:space-between; align-items:center; background:var(--surface);';
      div.innerHTML = `
        <div>
          <strong style="color:var(--fg);">${evt.title}</strong><br>
          <small style="color:var(--muted);">${evt.date} &middot; ${evt.time || ''} &middot; ${evt.venue || ''}</small>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline edit-evt-btn" data-evt='${JSON.stringify(evt)}' style="padding:4px 8px; font-size:12px;">Edit</button>
          <button class="btn btn-primary del-evt-btn" data-id="${evt.id}" style="padding:4px 8px; font-size:12px; background:#d9534f; border-color:#d9534f;">Del</button>
        </div>
      `;
      adminEventList.appendChild(div);
    });

    document.querySelectorAll('.edit-evt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const evt = JSON.parse(e.target.getAttribute('data-evt'));
        document.getElementById('eventIdInput').value = evt.id;
        document.getElementById('eventTitle').value = evt.title;
        document.getElementById('eventCategory').value = evt.category;
        document.getElementById('eventDate').value = evt.date;
        document.getElementById('eventTime').value = evt.time || '';
        document.getElementById('eventVenue').value = evt.venue || '';
        document.getElementById('eventDesc').value = evt.description || '';
        document.getElementById('eventCoord').value = evt.coordinator || '';
        document.getElementById('eventContact').value = evt.contact || '';
        addEventForm.classList.remove('hidden');
        showAddEventBtn.classList.add('hidden');
      });
    });

    document.querySelectorAll('.del-evt-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('Are you sure you want to delete this event?')) {
          const id = e.target.getAttribute('data-id');
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          renderAdminEvents();
        }
      });
    });
  }

  addEventForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idInput = document.getElementById('eventIdInput').value;

    const evtData = {
      title: document.getElementById('eventTitle').value,
      category: document.getElementById('eventCategory').value,
      date: document.getElementById('eventDate').value,
      time: document.getElementById('eventTime').value,
      venue: document.getElementById('eventVenue').value,
      description: document.getElementById('eventDesc').value,
      coordinator: document.getElementById('eventCoord').value,
      contact: document.getElementById('eventContact').value
    };

    let error;
    if (idInput) {
      ({ error } = await supabase.from('events').update(evtData).eq('id', idInput));
    } else {
      const { data: insertedData, error: insertError } = await supabase.from('events').insert([evtData]).select();
      error = insertError;
      if (!error && insertedData && insertedData.length > 0) {
        const newEvent = insertedData[0];
        // Fetch all registered user emails
        const { data: users, error: usersError } = await supabase
          .from('members')
          .select('email')
          .not('email', 'is', null);

        if (!usersError && users && users.length > 0) {
          const emails = users.map(u => u.email).filter(Boolean);
          if (emails.length > 0) {
            // Trigger Vercel function to notify users
            fetch('/api/notify-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: newEvent, emails })
            }).catch(err => console.error('Failed to send event notifications:', err));
          }
        }
      }
    }

    if (error) { alert('Save failed: ' + error.message); return; }

    addEventForm.reset();
    addEventForm.classList.add('hidden');
    showAddEventBtn.classList.remove('hidden');
    renderAdminEvents();
  });

  // ============================================================
  // CATEGORIES CACHE & CRUD
  // ============================================================
  let CATEGORIES_DB = [];

  async function loadCategories() {
    try {
      const { data, error } = await supabase
        .from('event_categories')
        .select('*')
        .order('name', { ascending: true });
      if (!error && data && data.length > 0) {
        CATEGORIES_DB = data;
      } else {
        console.warn('Empty or failed event_categories select, using fallbacks:', error?.message);
        CATEGORIES_DB = [{ name: 'Bhajans' }, { name: 'Seva' }, { name: 'Study Circle' }];
      }
    } catch (err) {
      console.warn('Failed to load categories, using fallbacks:', err);
      CATEGORIES_DB = [{ name: 'Bhajans' }, { name: 'Seva' }, { name: 'Study Circle' }];
    }
  }

  function populateEventCategoryDropdown() {
    const categorySelect = document.getElementById('eventCategory');
    if (!categorySelect) return;
    categorySelect.innerHTML = '';
    CATEGORIES_DB.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name.toLowerCase();
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  async function renderAdminCategories() {
    const categoryListEl = document.getElementById('adminCategoryList');
    if (!categoryListEl) return;
    
    // Populate event category choices
    populateEventCategoryDropdown();

    if (CATEGORIES_DB.length === 0) {
      categoryListEl.innerHTML = '<p class="text-muted" style="font-size:13px; width:100%;">No categories found.</p>';
      return;
    }

    categoryListEl.innerHTML = '';
    CATEGORIES_DB.forEach(cat => {
      const span = document.createElement('span');
      span.style = 'display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:20px; background:var(--accent-light); color:var(--accent-dark); border:1px solid var(--accent); font-size:12px; font-weight:600;';
      span.innerHTML = `
        ${cat.name}
        <button class="del-cat-btn" data-id="${cat.id}" data-name="${cat.name}" style="background:none; border:none; color:var(--accent-dark); font-weight:bold; font-size:14px; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:center; line-height:1;">&times;</button>
      `;
      categoryListEl.appendChild(span);
    });

    document.querySelectorAll('.del-cat-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.target.getAttribute('data-id');
        const name = e.target.getAttribute('data-name');
        if (confirm(`Are you sure you want to delete the category "${name}"? Events matching this category will remain, but the category option will be removed.`)) {
          const { error } = await supabase.from('event_categories').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          await loadCategories();
          renderAdminCategories();
        }
      });
    });
  }

  // Handle category creation
  const addCategoryForm = document.getElementById('addCategoryForm');
  addCategoryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newCategoryName');
    const name = nameInput.value.trim();
    if (!name) return;

    const { error } = await supabase.from('event_categories').insert([{ name }]);
    if (error) {
      alert('Failed to create category: ' + error.message);
      return;
    }

    nameInput.value = '';
    await loadCategories();
    renderAdminCategories();
  });

  // ============================================================
  // GALLERY MANAGEMENT (Supabase Storage + table)
  // ============================================================
  const addGalleryForm = document.getElementById('addGalleryForm');
  const adminGalleryList = document.getElementById('adminGalleryList');

  // Populate Gallery Event Dropdown
  async function populateGalleryEventDropdown() {
    const eventSelect = document.getElementById('galleryEventSelect');
    if (!eventSelect) return;
    
    // Clear dynamic options (keep first one)
    eventSelect.innerHTML = '<option value="">-- Link to Event (Optional) --</option>';

    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, category, date')
        .order('date', { ascending: false });

      if (!error && data) {
        data.forEach(evt => {
          const opt = document.createElement('option');
          opt.value = evt.id;
          opt.textContent = `${evt.title} (${evt.date})`;
          opt.setAttribute('data-category', evt.category);
          eventSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Failed to load events for gallery linking:', err);
    }
  }

  // Selected event auto-sync details if any (currently category auto-sync removed)

  async function renderAdminGallery() {
    if (!adminGalleryList) return;
    adminGalleryList.innerHTML = '<p style="color:var(--muted); font-size:13px; grid-column:1/-1;">Loading gallery...</p>';

    const { data, error } = await supabase
      .from('gallery')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) { adminGalleryList.innerHTML = '<p style="color:red; grid-column:1/-1;">Error loading gallery.</p>'; return; }
    if (!data || data.length === 0) {
      adminGalleryList.innerHTML = '<p class="text-muted" style="grid-column:1/-1; font-size:14px;">No gallery images uploaded.</p>';
      return;
    }

    adminGalleryList.innerHTML = '';
    data.forEach(item => {
      const div = document.createElement('div');
      div.style = 'position:relative; border-radius:8px; overflow:hidden; aspect-ratio:1; background:#111;';
      const imgSrc = item.src_url || '';
      div.innerHTML = imgSrc
        ? `<img src="${imgSrc}" style="width:100%; height:100%; object-fit:cover; opacity:0.85;">
           <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:#fff; padding:4px 6px; font-size:10px;">${item.caption}</div>
           <button class="del-gal-btn" data-id="${item.id}" data-path="${item.storage_path || ''}" style="position:absolute; top:4px; right:4px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; font-size:12px; cursor:pointer;">&times;</button>`
        : `<div style="display:flex; align-items:center; justify-content:center; height:100%; font-size:32px;">${item.placeholder || '🖼️'}</div>
           <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.7); color:#fff; padding:4px 6px; font-size:10px;">${item.caption}</div>
           <button class="del-gal-btn" data-id="${item.id}" data-path="" style="position:absolute; top:4px; right:4px; background:red; color:white; border:none; border-radius:50%; width:24px; height:24px; font-size:12px; cursor:pointer;">&times;</button>`;
      adminGalleryList.appendChild(div);
    });

    document.querySelectorAll('.del-gal-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (confirm('Delete this image from gallery?')) {
          const id = e.target.getAttribute('data-id');
          const storagePath = e.target.getAttribute('data-path');
          // Delete from storage if it has a path
          if (storagePath) {
            await supabase.storage.from('gallery-images').remove([storagePath]);
          }
          const { error } = await supabase.from('gallery').delete().eq('id', id);
          if (error) { alert('Delete failed: ' + error.message); return; }
          renderAdminGallery();
        }
      });
    });
  }

  addGalleryForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('galleryImageInput').files[0];
    
    // Compute category from selected event, or default to general
    const eventSelect = document.getElementById('galleryEventSelect');
    let category = 'general';
    if (eventSelect && eventSelect.value) {
      const selectedOption = eventSelect.options[eventSelect.selectedIndex];
      category = selectedOption.getAttribute('data-category') || 'general';
    }

    const caption = document.getElementById('galleryCaption').value;
    if (!file) return;

    const uploadBtn = document.getElementById('uploadGalleryBtn');
    uploadBtn.textContent = 'Uploading...';
    uploadBtn.disabled = true;

    try {
      // Compress image using canvas
      const compressedBlob = await compressImage(file, 1200, 0.75);
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const storagePath = `${category}/${fileName}`;

      // Upload to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from('gallery-images')
        .upload(storagePath, compressedBlob, { contentType: 'image/jpeg', upsert: false });

      let src_url = null;
      if (!storageError) {
        const { data: urlData } = supabase.storage.from('gallery-images').getPublicUrl(storagePath);
        src_url = urlData?.publicUrl || null;
      } else {
        console.warn('Storage upload failed, saving without image URL:', storageError.message);
      }

      // Insert metadata into gallery table (with event_id if set)
      const insertData = {
        caption,
        category,
        src_url,
        storage_path: storagePath
      };

      const eventSelect = document.getElementById('galleryEventSelect');
      if (eventSelect && eventSelect.value) {
        insertData.event_id = parseInt(eventSelect.value);
      }

      let { error: dbError } = await supabase.from('gallery').insert([insertData]);

      if (dbError) {
        console.warn('First insert attempt with event_id failed:', dbError.message);
        if (dbError.message && (dbError.message.includes('event_id') || dbError.message.includes('column'))) {
          // Retry without event_id
          console.warn('Retrying database insert without event_id...');
          delete insertData.event_id;
          const { error: retryError } = await supabase.from('gallery').insert([insertData]);
          if (retryError) {
            alert('Database save failed: ' + retryError.message);
            return;
          }
        } else {
          alert('Database save failed: ' + dbError.message);
          return;
        }
      }

      addGalleryForm.reset();
      renderAdminGallery();
    } catch (err) {
      console.error('Gallery upload error:', err);
      alert('Upload failed. Please try again.');
    } finally {
      uploadBtn.textContent = 'Upload to Gallery';
      uploadBtn.disabled = false;
    }
  });

  // Compress image using canvas before upload
  function compressImage(file, maxSize, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ============================================================
  // DOWNLOAD CARD
  // ============================================================
  const downloadCardBtn = document.getElementById('downloadCardBtn');
  downloadCardBtn?.addEventListener('click', () => {
    const cardElement = document.querySelector('.member-card');
    if (!cardElement) return;
    const originalTransform = cardElement.style.transform;
    cardElement.style.transform = 'none';
    html2canvas(cardElement, { scale: 2, backgroundColor: null, useCORS: true })
      .then(canvas => {
        cardElement.style.transform = originalTransform;
        const link = document.createElement('a');
        link.download = 'Sathya_Sai_Membership_Card.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      })
      .catch(err => {
        console.error('Card download error:', err);
        cardElement.style.transform = originalTransform;
        alert('Failed to download card. Please try again.');
      });
  });

});
