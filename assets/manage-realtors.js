(function () {
  'use strict';
  const form = document.getElementById('manageRealtorForm');
  const list = document.getElementById('managementRoster');
  const count = document.getElementById('managementCount');
  const formMessage = document.getElementById('manageFormMessage');
  const exportMessage = document.getElementById('manageExportMessage');
  const copyButton = document.getElementById('copyRosterJson');
  if (!form || !list || !copyButton) return;

  let roster = [];
  let changed = false;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const safeString = value => String(value ?? '').trim();
  const integerCid = value => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null;
  };
  const showMessage = (target, message, error = false) => {
    target.textContent = message;
    target.dataset.error = error ? 'true' : 'false';
  };

  function renderRoster() {
    const sorted = [...roster].sort((a, b) => Number(a.displayOrder ?? 999) - Number(b.displayOrder ?? 999));
    count.textContent = sorted.length + (sorted.length === 1 ? ' profile' : ' profiles');
    list.innerHTML = sorted.length ? sorted.map(person => {
      const owner = String(person.role).toLowerCase() === 'owner';
      const cid = integerCid(person.characterId);
      const letters = safeString(person.name).split(/\s+/).filter(Boolean)
        .map(s => s.slice(0,1)).slice(0,2).join('').toUpperCase();
      const hiddenLabel = person.published === true ? 'Public profile' : 'Unpublished';
      return '<div class="manage-person">' +
        '<span class="manage-person-avatar" aria-hidden="true">' + escapeHtml(letters || 'BI') + '</span>' +
        '<div class="manage-person-details"><strong>' + escapeHtml(person.name) + '</strong>' +
        '<span>' + escapeHtml(owner ? 'Owner' : 'Realtor') + ' · CID ' + (cid ?? 'not set') + '</span></div>' +
        '<span class="manage-public-label ' + (person.published ? 'is-published' : '') + '">' + hiddenLabel + '</span></div>';
    }).join('') : '<div class="manage-empty">No profiles in the directory.</div>';
    copyButton.disabled = !changed;
  }

  function nextDisplayOrder() {
    return roster.reduce((max, p) => Math.max(max, Number(p.displayOrder) || 0), 0) + 1;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    showMessage(formMessage, '');
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const name = safeString(data.get('name'));
    const cid = integerCid(data.get('characterId'));
    if (!name || !cid) {
      showMessage(formMessage, 'A character name and valid CID are required.', true);
      return;
    }
    if (roster.some(p => integerCid(p.characterId) === cid)) {
      showMessage(formMessage, 'This Character ID already exists in the roster. No duplicate was added.', true);
      return;
    }
    const discordId = safeString(data.get('discordId'));
    if (discordId && !/^\d{17,20}$/.test(discordId)) {
      showMessage(formMessage, 'Discord User ID must contain 17 to 20 digits.', true);
      return;
    }
    const photo = safeString(data.get('photo'));
    if (photo && (!/^https:\/\//i.test(photo) || photo.length > 2048)) {
      showMessage(formMessage, 'Use a valid HTTPS URL for an optional photo.', true);
      return;
    }
    const entry = {
      published: data.get('published') === 'on',
      displayOrder: nextDisplayOrder(),
      name,
      role: 'Realtor',
      title: safeString(data.get('title')) || 'Realtor',
      characterId: cid,
      photo,
      inGamePhone: safeString(data.get('inGamePhone')),
      discordUsername: safeString(data.get('discordUsername')),
      discordId,
      email: '',
      bio: safeString(data.get('bio'))
    };
    roster.push(entry);
    changed = true;
    renderRoster();
    form.reset();
    document.getElementById('realtorTitle').value = 'Realtor';
    showMessage(formMessage, name + ' has been added to your draft. Copy and commit the updated roster in GitHub to publish it.');
  });

  copyButton.addEventListener('click', async () => {
    if (!changed) return;
    const json = JSON.stringify(roster, null, 2) + '\n';
    try {
      await navigator.clipboard.writeText(json);
      showMessage(exportMessage, 'Updated Realtor directory copied. Open the GitHub editor, replace the JSON, and commit.');
    } catch (e) {
      // Browsers that block clipboard access can still download the prepared JSON.
      const blob = new Blob([json], {type: 'application/json;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'realtors.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage(exportMessage, 'Downloaded realtors.json. Open the GitHub editor and paste or upload its contents.');
    }
  });

  async function loadRoster() {
    try {
      const response = await fetch('data/realtors.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Roster request failed');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Unexpected directory format');
      roster = data.filter(p => p && typeof p === 'object').map(p => ({...p}));
      renderRoster();
    } catch (error) {
      list.innerHTML = '<div class="manage-empty">Could not load the current roster. To prevent overwriting existing profiles, adding Realtors is disabled until the directory loads.</div>';
      for (const element of form.elements) element.disabled = true;
      showMessage(formMessage, 'Roster unavailable. Reload this page and try again.', true);
    }
  }
  loadRoster();
})();