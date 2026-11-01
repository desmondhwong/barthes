// hx generated 261101 — run this function through Playwright against the DOM harness.
async (page) => {
  const results = [];
  const check = (name, value) => { if (!value) throw new Error(name); results.push({name, result:'pass'}); };
  await page.goto('http://127.0.0.1:3012/tests/obsidian/panel.html');
  await page.setViewportSize({width:920,height:900});
  await page.getByText('Add a net', {exact:true}).click();
  await page.locator('[data-barthes-focus="net-name"]').fill('A new net');
  await page.locator('[data-barthes-focus="add-net"]').click();
  check('Whole-vault publication requires an explicit source choice', await page.evaluate(()=>window.barthesFixture.calls.length===0));
  await page.locator('[data-barthes-focus="source-folder"]').selectOption('net-b');
  await page.locator('[data-barthes-focus="net-name"]').fill('A new net');
  await page.locator('[data-barthes-focus="add-net"]').click();
  check('Adding a net passes only the explicit source and destination', await page.evaluate(() => {
    const call = window.barthesFixture.calls.at(-1);
    return call.action === 'addNet' && call.payload.folder === 'net-b' && call.payload.title === 'A new net' && !call.payload.channelId;
  }));
  await page.locator('[data-barthes-focus="destination"]').selectOption('10');
  await page.locator('[data-barthes-focus="net-name"]').fill('');
  await page.locator('[data-barthes-focus="add-net"]').click();
  check('Selecting an existing channel preserves its identity', await page.evaluate(() => {
    const call = window.barthesFixture.calls.at(-1);
    return call.action === 'addNet' && call.payload.channelId === '10' && call.payload.title === 'Reading notes';
  }));
  await page.locator('[data-barthes-focus="net-name"]').fill('Unfinished name');
  await page.locator('[data-barthes-focus="net-name"]').focus();
  await page.evaluate(() => {
    document.activeElement.setSelectionRange(3,8);
    window.barthesFixture.model.message = 'Review refreshed'; window.barthesFixture.render();
  });
  check('Model refresh preserves draft, focus and text selection', await page.evaluate(() => {
    const active=document.activeElement;
    return active.value === 'Unfinished name' && active.selectionStart === 3 && active.selectionEnd === 8 && document.querySelector('[data-barthes-focus="source-folder"]').value==='net-b';
  }));
  await page.getByText('net-a/Second note.md — Both edited',{exact:true}).click();
  check('Review renders source markup as inert text', await page.evaluate(() => !window.untrustedRan && !document.querySelector('.barthes-versions script,.barthes-versions img')));
  await page.getByRole('button',{name:'Keep Obsidian version',exact:true}).click();
  check('Conflict resolution specifies the exact note and chosen version', await page.evaluate(() => {
    const call=window.barthesFixture.calls.at(-1);
    return call.action==='resolve' && call.payload.note==='a2' && call.payload.choice==='local';
  }));
  await page.getByRole('button',{name:'Publish reviewed changes',exact:true}).click();
  check('Publish acts on the displayed net review', await page.evaluate(()=>window.barthesFixture.calls.at(-1).action==='publish' && window.barthesFixture.calls.at(-1).payload==='a'));
  await page.getByText('Sync and backups',{exact:true}).click();
  await page.getByRole('button',{name:'Export sync state',exact:true}).click();
  check('Export remains reachable', await page.evaluate(()=>window.barthesFixture.calls.at(-1).action==='exportState'));
  await page.locator('input[type=file]').setInputFiles({name:'state.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});
  check('Import passes the chosen file to validation', await page.evaluate(()=>window.barthesFixture.calls.at(-1).action==='importState' && window.barthesFixture.calls.at(-1).payload==='state.json'));
  await page.evaluate(()=>{ window.barthesFixture.model.plan.blockers=['An outside link needs review.']; window.barthesFixture.render(); });
  check('Blockers disable publish and pull', await page.getByRole('button',{name:'Publish reviewed changes',exact:true}).isDisabled() && await page.getByRole('button',{name:'Pull Are.na changes',exact:true}).isDisabled());
  await page.evaluate(()=>{ window.barthesFixture.model.plan.blockers=[]; window.barthesFixture.model.nets[0].paused=true; window.barthesFixture.render(); });
  check('Paused net prevents writes including conflict resolution', await page.getByRole('button',{name:'Publish reviewed changes',exact:true}).isDisabled() && await page.getByRole('button',{name:'Keep Obsidian version',exact:true}).isDisabled());
  await page.evaluate(()=>{ window.barthesFixture.model.nets[0].paused=false; window.barthesFixture.model.publisherDevice=false; window.barthesFixture.render(); });
  check('Automatic sync requires a selected publishing device', await page.locator('[data-barthes-focus="auto:a"]').isDisabled());
  await page.evaluate(()=>{ window.barthesFixture.model.publisherDevice=true; window.barthesFixture.render(); });
  check('Automatic sync requires an initial reviewed publication', await page.locator('[data-barthes-focus="auto:b"]').isDisabled());
  await page.evaluate(()=>{
    Object.assign(window.barthesFixture.model.nets[0],{sourceIssue:'The moved source overlaps another net. Repair the source before resuming.',pendingFolder:'net-b/moved',paused:true});
    window.barthesFixture.render();
  });
  check('A source conflict exposes repair and prevents resume', await page.locator('[data-barthes-focus="repair-folder:a"]').isVisible() && await page.locator('[data-barthes-focus="pause:a"]').isDisabled());
  const beforeRepair=await page.evaluate(()=>window.barthesFixture.calls.length);
  await page.getByRole('button',{name:'Save repaired source',exact:true}).click();
  check('Source repair requires an explicit folder choice',await page.evaluate(()=>window.barthesFixture.calls.length)===beforeRepair);
  await page.locator('[data-barthes-focus="repair-folder:a"]').selectOption('net-a');
  await page.getByRole('button',{name:'Save repaired source',exact:true}).click();
  check('Source repair passes only the chosen net and folder',await page.evaluate(()=>{
    const call=window.barthesFixture.calls.at(-1);return call.action==='setSource' && call.payload.net==='a' && call.payload.folder==='net-a';
  }));
  await page.evaluate(()=>{
    delete window.barthesFixture.model.nets[0].sourceIssue;delete window.barthesFixture.model.nets[0].pendingFolder;
    window.barthesFixture.model.nets[0].paused=false;window.barthesFixture.render();
  });
  for (const variant of [
    {name:'desktop',width:920,height:900,dark:false,large:false},
    {name:'narrow',width:360,height:600,dark:false,large:false},
    {name:'short-dark',width:920,height:380,dark:true,large:false},
    {name:'enlarged-dark',width:390,height:650,dark:true,large:true},
  ]) {
    await page.setViewportSize({width:variant.width,height:variant.height});
    await page.evaluate(variant=>{
      document.body.classList.toggle('dark',variant.dark);
      document.documentElement.style.setProperty('--font-ui-small',variant.large?'22px':'14px');
      document.querySelector('#panel').scrollTop=0;
    },variant);
    check(`${variant.name}: no horizontal overflow`,await page.evaluate(()=>{
      const panel=document.querySelector('#panel'); return panel.scrollWidth<=panel.clientWidth+1;
    }));
    await page.getByRole('button',{name:'Export sync state',exact:true}).scrollIntoViewIfNeeded();
    check(`${variant.name}: bottom controls remain reachable`,await page.getByRole('button',{name:'Export sync state',exact:true}).isVisible());
  }
  await page.locator('[data-barthes-focus="net-name"]').focus();
  await page.keyboard.press('Tab');
  check('Keyboard advances through ordinary controls',await page.evaluate(()=>document.activeElement.dataset.barthesFocus==='add-net'));
  await page.evaluate(()=>{ window.barthesFixture.model.connected=false; window.barthesFixture.render(); });
  check('Disconnected state offers connection and prevents publication',await page.getByRole('button',{name:'Connect Are.na',exact:true}).isVisible() && await page.getByRole('button',{name:'Publish reviewed changes',exact:true}).isDisabled());
  await page.evaluate(()=>{ window.barthesFixture.model.connected=true; window.barthesFixture.render(); });
  return results;
}
