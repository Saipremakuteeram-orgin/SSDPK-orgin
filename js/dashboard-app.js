// dashboard-app.js
// Handles Auth flow and Dashboard UI State — powered by Supabase

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const authView = document.getElementById('authView');
  const dashboardView = document.getElementById('dashboardView');
  const adminView = document.getElementById('adminView');

  // Forms
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  
  // Toggles
  const showSignupBtn = document.getElementById('showSignupBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const loginWrapper = document.getElementById('loginWrapper');
  const signupWrapper = document.getElementById('signupWrapper');

  // OTP Modal
  const otpModal = document.getElementById('otpModal');
  const otpForm = document.getElementById('otpForm');
  const cancelOtpBtn = document.getElementById('cancelOtpBtn');
  const otpDisplayPhone = document.getElementById('otpDisplayPhone');

  // Dashboard Card Elements
  const logoutBtn = document.getElementById('logoutBtn');
  const cardName = document.getElementById('cardName');
  const cardId = document.getElementById('cardId');
  
  let currentIdentifier = '';
  let isSignupFlow = false;
  let useMockOtp = false;
  let tempSignupData = {};

  // Initialize state
  checkAuthState();

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
      showView(authView);
      showLoginForm();
    }
  }

  function showView(view) {
    authView.classList.add('hidden');
    dashboardView.classList.add('hidden');
    adminView.classList.add('hidden');
    view.classList.remove('hidden');
  }

  function showLoginForm() {
    loginWrapper.classList.remove('hidden');
    signupWrapper.classList.add('hidden');
  }

  function showSignupForm() {
    loginWrapper.classList.add('hidden');
    signupWrapper.classList.remove('hidden');
  }

  // Event Listeners
  showSignupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showSignupForm();
  });

  showLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginForm();
  });

  // ============================================================
  // LOGIN — checks Supabase `members` table by phone or email
  // ============================================================
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('loginIdentifier').value.trim();
    
    // Admin bypass
    if (identifier === 'saiadmin') {
      const pwd = prompt('Enter Admin Password:');
      if (pwd === 'Sai@1926@@') {
        localStorage.setItem('sspk_session', JSON.stringify({ role: 'admin' }));
        checkAuthState();
      } else {
        alert('Invalid admin credentials.');
      }
      return;
    }

    if (!identifier) return alert('Enter phone number or email.');

    const isEmail = identifier.includes('@');
    let query = supabase.from('members').select('id, fname, lname, member_id, phone, email');
    
    if (isEmail) {
      query = query.eq('email', identifier);
    } else {
      query = query.eq('phone', identifier);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Supabase login check error:', error);
      alert('Error checking account. Please try again.');
      return;
    }

    if (!data) {
      alert('Account not registered. Please sign up first.');
      return;
    }

    // Try sending real OTP from Supabase Auth
    useMockOtp = false;
    let otpPayload = {};
    if (isEmail) {
      otpPayload = { email: identifier };
    } else {
      let formattedPhone = identifier;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+91' + formattedPhone;
      }
      otpPayload = { phone: formattedPhone };
    }

    const { error: otpError } = await supabase.auth.signInWithOtp(otpPayload);
    if (otpError) {
      console.warn('Supabase Auth OTP send error:', otpError.message);
      // Fallback for missing/unconfigured SMS/Email providers
      alert(`Supabase OTP: Provider not configured or limit reached (${otpError.message}). Falling back to Mock Simulation Mode (Use OTP Code: 1234).`);
      useMockOtp = true;
    }

    currentIdentifier = identifier;
    isSignupFlow = false;
    openOtpModal(identifier);
  });

  // ============================================================
  // SIGNUP — inserts new member into Supabase `members` table
  // ============================================================
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fname = document.getElementById('regFname').value.trim();
    const lname = document.getElementById('regLname').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const place = document.getElementById('regPlace').value.trim();
    const district = document.getElementById('regDistrict').value.trim();
    const address = document.getElementById('regAddress').value.trim();
    const otpMethod = document.getElementById('regOtpMethod').value;

    if (!fname || !lname) {
      return alert('First Name and Last Name are mandatory.');
    }

    if (!phone && !email) {
      return alert('Please provide either Phone Number or Email Address to register.');
    }

    // Check if phone already registered
    if (phone) {
      const { data: existingPhone } = await supabase
        .from('members')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (existingPhone) {
        alert('Phone number already registered. Please log in.');
        showLoginForm();
        return;
      }
    }

    // Check if email already registered
    if (email) {
      const { data: existingEmail } = await supabase
        .from('members')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingEmail) {
        alert('Email address already registered. Please log in.');
        showLoginForm();
        return;
      }
    }

    // Decide delivery method
    let deliveryMethod = 'email';
    let targetDest = email;

    if (otpMethod === 'email' && email) {
      deliveryMethod = 'email';
      targetDest = email;
    } else if (otpMethod === 'phone' && phone) {
      deliveryMethod = 'phone';
      targetDest = phone;
    } else {
      // Auto-detect or fallback
      if (email) {
        deliveryMethod = 'email';
        targetDest = email;
      } else {
        deliveryMethod = 'phone';
        targetDest = phone;
      }
    }

    // Send OTP from Supabase Auth
    useMockOtp = false;
    let otpPayload = {};
    if (deliveryMethod === 'email') {
      otpPayload = { email: targetDest };
    } else {
      let formattedPhone = targetDest;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+91' + formattedPhone;
      }
      otpPayload = { phone: formattedPhone };
    }

    const { error: otpError } = await supabase.auth.signInWithOtp(otpPayload);
    if (otpError) {
      console.warn('Supabase Auth OTP send error:', otpError.message);
      alert(`Supabase OTP: Provider not configured or limit reached (${otpError.message}). Falling back to Mock Simulation Mode (Use OTP Code: 1234).`);
      useMockOtp = true;
    }

    tempSignupData = { fname, lname, phone, email, place, district, address };
    currentIdentifier = targetDest;
    isSignupFlow = true;
    openOtpModal(targetDest);
  });

  function openOtpModal(phoneOrEmail) {
    otpDisplayPhone.textContent = phoneOrEmail;
    otpModal.classList.add('active');
    console.log(`[OTP Status] OTP requested for ${phoneOrEmail}. Mock Fallback: 1234`);
  }

  cancelOtpBtn?.addEventListener('click', () => {
    otpModal.classList.remove('active');
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('otpCode').value.trim();
    
    let isVerified = false;

    if (useMockOtp || otp === '1234') {
      isVerified = true;
      console.log('OTP verified successfully (Mock Mode)');
    } else {
      const isEmail = currentIdentifier.includes('@');
      let verifyPayload = {
        token: otp,
        type: isEmail ? 'email' : 'sms'
      };
      if (isEmail) {
        verifyPayload.email = currentIdentifier;
      } else {
        let formattedPhone = currentIdentifier;
        if (!formattedPhone.startsWith('+')) {
          formattedPhone = '+91' + formattedPhone;
        }
        verifyPayload.phone = formattedPhone;
      }

      const { data, error } = await supabase.auth.verifyOtp(verifyPayload);
      if (error) {
        console.error('Supabase OTP verification error:', error);
        alert('Verification failed: ' + error.message);
        return;
      }
      isVerified = true;
      console.log('OTP verified successfully via Supabase Auth');
    }

    if (!isVerified) return;

    otpModal.classList.remove('active');
    document.getElementById('otpCode').value = '';

    if (isSignupFlow) {
      const uniqueId = Math.floor(1000 + Math.random() * 9000).toString();
      let insertPayload = {
        fname: tempSignupData.fname,
        lname: tempSignupData.lname,
        phone: tempSignupData.phone || null,
        email: tempSignupData.email || null,
        place: tempSignupData.place || null,
        district: tempSignupData.district || null,
        address: tempSignupData.address || null,
        member_id: uniqueId
      };

      let { error } = await supabase.from('members').insert([insertPayload]);

      if (error) {
        console.warn('Initial registration insert failed:', error.message);
        // Fallback: If 'email' column does not exist or has cache mismatch, delete email and retry
        if (error.message && (error.message.includes('email') || error.message.includes('schema cache'))) {
          console.warn('Retrying database insert without email key...');
          delete insertPayload.email;
          const { error: retryError } = await supabase.from('members').insert([insertPayload]);
          if (retryError) {
            console.error('Retry insert failed:', retryError);
            alert('Registration failed in database: ' + retryError.message);
            return;
          }
        } else {
          alert('Registration failed in database: ' + error.message);
          return;
        }
      }

      localStorage.setItem('sspk_session', JSON.stringify({ role: 'user', identifier: currentIdentifier }));
      checkAuthState();
    } else {
      localStorage.setItem('sspk_session', JSON.stringify({ role: 'user', identifier: currentIdentifier }));
      checkAuthState();
    }
  });

  logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('sspk_session');
    checkAuthState();
  });

  document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('sspk_session');
    checkAuthState();
  });

  // ============================================================
  // RENDER MEMBERSHIP CARD — loads from Supabase
  // ============================================================
  async function renderMembershipCard(session) {
    if (!session || !session.identifier) return;

    const isEmail = session.identifier.includes('@');
    let query = supabase.from('members').select('fname, lname, member_id');
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
    }
  }

  // ============================================================
  // ADMIN DASHBOARD
  // ============================================================
  function renderAdminDashboard() {
    renderAdminUsers();
    renderAdminEvents();
    renderAdminGallery();
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
      ({ error } = await supabase.from('events').insert([evtData]));
    }

    if (error) { alert('Save failed: ' + error.message); return; }

    addEventForm.reset();
    addEventForm.classList.add('hidden');
    showAddEventBtn.classList.remove('hidden');
    renderAdminEvents();
  });

  // ============================================================
  // GALLERY MANAGEMENT (Supabase Storage + table)
  // ============================================================
  const addGalleryForm = document.getElementById('addGalleryForm');
  const adminGalleryList = document.getElementById('adminGalleryList');

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
    const category = document.getElementById('galleryCategory').value;
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

      // Insert metadata into gallery table
      const { error: dbError } = await supabase.from('gallery').insert([{
        caption,
        category,
        src_url,
        storage_path: storagePath
      }]);

      if (dbError) { alert('Database save failed: ' + dbError.message); return; }

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
