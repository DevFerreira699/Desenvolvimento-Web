(function () {
    'use strict';
    const DBNAME = 'riscozero-db', DBVER = 1;
    const GRAVS = ['Baixa', 'Média', 'Alta', 'Crítica'];
    const STATUS = ['Aberta', 'Em andamento', 'Concluída'];
    const MEDIDAS = {
        'Acidente de trabalho': 'Revisar o procedimento, reforçar o treinamento e exigir EPI.',
        'Quase acidente': 'Investigar a causa e corrigir a condição antes que cause um acidente.',
        'Incêndio ou fogo': 'Inspecionar extintores e saídas de emergência; fazer simulado.',
        'Falha elétrica': 'Chamar eletricista habilitado e revisar fiação e proteções.',
        'Queda': 'Corrigir o piso, sinalizar e melhorar a iluminação.',
        'Vazamento': 'Isolar a área, reparar a tubulação e criar rotina de inspeção.',
        'Segurança patrimonial': 'Reforçar controle de acesso, iluminação e câmeras.',
        'Outro': 'Avaliar com a equipe responsável e definir uma ação preventiva.'
    };
    const TIPOS = Object.keys(MEDIDAS);
    let DB = null;
    let state = { occ: [], hist: [], med: {} };
    const openLogs = new Set();

    const $ = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = d => { const p = String(d).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d };
    const today = () => { const x = new Date(); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10) };
    const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const chaveOf = d => [norm(d.tipo), norm(d.local), d.data, norm(d.desc)].join('|');

    /* ---------- lógica pura ---------- */
    function validate(d) {
        const e = {};
        if (!d.tipo) e.tipo = 'Escolha o tipo da ocorrência.';
        if (!d.grav) e.grav = 'Escolha a gravidade.';
        if (!String(d.local).trim()) e.local = 'Informe o local.';
        if (!d.data) e.data = 'Informe a data.';
        else if (d.data > today()) e.data = 'A data não pode estar no futuro.';
        if (!String(d.desc).trim()) e.desc = 'Descreva a ocorrência.';
        else if (String(d.desc).trim().length < 10) e.desc = 'Use pelo menos 10 caracteres na descrição.';
        return e;
    }
    function riskList(list) {
        const m = {};
        list.forEach(o => {
            const k = norm(o.tipo + '|' + o.local), r = m[k] || (m[k] = { tipo: o.tipo, local: o.local, nivel: 0, total: 0, abertas: 0 });
            r.total++; if (o.status !== 'Concluída') r.abertas++;
            r.nivel = Math.max(r.nivel, GRAVS.indexOf(o.grav));
        });
        return Object.keys(m).map(k => m[k]).sort((a, b) => b.nivel - a.nivel || b.abertas - a.abertas);
    }
    function stats(list) {
        return {
            total: list.length,
            altos: list.filter(o => (o.grav === 'Alta' || o.grav === 'Crítica') && o.status !== 'Concluída').length,
            pend: list.filter(o => o.status !== 'Concluída').length,
            riscos: riskList(list).length
        };
    }

    /* ---------- banco de dados (IndexedDB) ---------- */
    function openDb(name, ver, upgrade) {
        return new Promise((res, rej) => {
            const r = indexedDB.open(name, ver);
            r.onupgradeneeded = () => upgrade(r.result, r.transaction);
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
            r.onblocked = () => rej(new Error('Banco bloqueado por outra aba aberta.'));
        });
    }
    function createSchema(db) {
        const oc = db.createObjectStore('ocorrencias', { keyPath: 'id', autoIncrement: true });
        oc.createIndex('gravidade', 'grav');
        oc.createIndex('status', 'status');
        oc.createIndex('data', 'data');
        oc.createIndex('chave', 'chave', { unique: true });
        const h = db.createObjectStore('historico', { keyPath: 'id', autoIncrement: true });
        h.createIndex('ocorrenciaId', 'ocorrenciaId');
        db.createObjectStore('medidas', { keyPath: 'tipo' });
        db.createObjectStore('meta', { keyPath: 'k' });
    }
    function seedList() {
        const d = n => { const x = new Date(); x.setDate(x.getDate() - n); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10) };
        return [
            { tipo: 'Queda', local: 'Corredor do bloco B', data: d(2), desc: 'Funcionário escorregou em piso molhado, sem sinalização.', grav: 'Média', status: 'Em andamento' },
            { tipo: 'Falha elétrica', local: 'Sala de servidores', data: d(4), desc: 'Disjuntor desarmou duas vezes na semana, com cheiro de queimado.', grav: 'Alta', status: 'Aberta' },
            { tipo: 'Quase acidente', local: 'Almoxarifado', data: d(6), desc: 'Prateleira alta quase caiu durante a retirada de caixas.', grav: 'Alta', status: 'Aberta' },
            { tipo: 'Vazamento', local: 'Copa', data: d(9), desc: 'Vazamento na pia molhou o piso e a tomada próxima.', grav: 'Baixa', status: 'Concluída' },
            { tipo: 'Incêndio ou fogo', local: 'Cozinha industrial', data: d(12), desc: 'Princípio de fogo em fritadeira, controlado com extintor.', grav: 'Crítica', status: 'Concluída' }
        ];
    }
    function seedData(tx) {
        const oc = tx.objectStore('ocorrencias'), hs = tx.objectStore('historico');
        seedList().forEach(s => {
            const rec = Object.assign({}, s, { chave: chaveOf(s) });
            const r = oc.add(rec);
            r.onsuccess = () => {
                hs.add({ ocorrenciaId: r.result, data: s.data, texto: 'Ocorrência registrada.' });
                if (s.status !== 'Aberta') hs.add({ ocorrenciaId: r.result, data: s.data, texto: 'Andamento alterado para ' + s.status + '.' });
            };
        });
    }
    function run(db, stores, mode, fn) {
        return new Promise((res, rej) => {
            const tx = db.transaction(stores, mode);
            let out;
            tx.oncomplete = () => res(out && out.result);
            tx.onerror = e => rej(e.target.error || tx.error);
            tx.onabort = () => rej(tx.error);
            out = fn(tx);
        });
    }
    const getAll = store => run(DB, [store], 'readonly', tx => tx.objectStore(store).getAll());

    async function addOcc(d) {
        const rec = { tipo: d.tipo, local: d.local.trim(), data: d.data, desc: d.desc.trim(), grav: d.grav, status: 'Aberta' };
        rec.chave = chaveOf(rec);
        return run(DB, ['ocorrencias', 'historico'], 'readwrite', tx => {
            const r = tx.objectStore('ocorrencias').add(rec);
            r.onsuccess = () => tx.objectStore('historico').add({ ocorrenciaId: r.result, data: today(), texto: 'Ocorrência registrada.' });
            return r;
        });
    }
    function setStatus(id, st) {
        return run(DB, ['ocorrencias', 'historico'], 'readwrite', tx => {
            const s = tx.objectStore('ocorrencias'), g = s.get(id);
            g.onsuccess = () => {
                const o = g.result; o.status = st; s.put(o);
                tx.objectStore('historico').add({ ocorrenciaId: id, data: today(), texto: 'Andamento alterado para ' + st + '.' });
            };
            return g;
        });
    }
    function delOcc(id) {
        return run(DB, ['ocorrencias', 'historico'], 'readwrite', tx => {
            const c = tx.objectStore('historico').index('ocorrenciaId').openCursor(IDBKeyRange.only(id));
            c.onsuccess = () => { const cur = c.result; if (cur) { cur.delete(); cur.continue() } };
            return tx.objectStore('ocorrencias').delete(id);
        });
    }
    const wipe = reseed => run(DB, ['ocorrencias', 'historico'], 'readwrite', tx => {
        tx.objectStore('ocorrencias').clear(); tx.objectStore('historico').clear();
        if (reseed) seedData(tx);
    });

    async function refresh() {
        const [occ, hist, med] = await Promise.all([getAll('ocorrencias'), getAll('historico'), getAll('medidas')]);
        state.occ = occ; state.hist = hist; state.med = {}; med.forEach(m => { state.med[m.tipo] = m.texto });
        renderAll();
    }
    function showError(msg) { $('dbError').textContent = msg; $('dbError').hidden = false }
    const guard = fn => async (...a) => { try { await fn(...a) } catch (e) { showError('Erro no banco de dados: ' + (e && e.message || e)) } };

    /* ---------- renderização ---------- */
    function bars(el, rows, colors) {
        const max = Math.max(1, ...rows.map(r => r[1]));
        el.innerHTML = rows.map((r, i) => '<div class="bar"><span>' + esc(r[0]) + '</span><i style="width:' + (r[1] / max * 100) + '%;background:' + colors[i] + '"></i><em>' + r[1] + '</em></div>').join('');
    }
    const sorted = () => state.occ.slice().sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

    function renderDash() {
        const s = stats(state.occ);
        $('kpis').innerHTML =
            '<div class="card kpi"><b>' + s.total + '</b><span>Total de ocorrências</span></div>' +
            '<div class="card kpi ' + (s.altos ? 'red' : 'green') + '"><b>' + s.altos + '</b><span>Riscos altos em aberto (gravidade alta ou crítica)</span></div>' +
            '<div class="card kpi ' + (s.pend ? 'amber' : 'green') + '"><b>' + s.pend + '</b><span>Pendências (abertas ou em andamento)</span></div>' +
            '<div class="card kpi"><b>' + s.riscos + '</b><span>Riscos mapeados</span></div>';
        bars($('chGrav'), GRAVS.map(g => [g, state.occ.filter(o => o.grav === g).length]), ['var(--baixa)', 'var(--media)', 'var(--alta)', 'var(--critica)']);
        bars($('chSt'), STATUS.map(t => [t, state.occ.filter(o => o.status === t).length]), ['var(--critica)', 'var(--media)', 'var(--green)']);
        const rec = sorted().slice(0, 5);
        $('tRecent').innerHTML = '<thead><tr><th>Data</th><th>Tipo</th><th>Local</th><th>Gravidade</th><th>Andamento</th></tr></thead><tbody>' +
            (rec.length ? rec.map(o => '<tr><td>' + fmt(o.data) + '</td><td>' + esc(o.tipo) + '</td><td>' + esc(o.local) + '</td><td><span class="badge g-' + o.grav + '">' + o.grav + '</span></td><td>' + esc(o.status) + '</td></tr>').join('') : '<tr><td colspan="5" class="empty">Nenhuma ocorrência registrada.</td></tr>') + '</tbody>';
    }
    function renderRisk() {
        const rs = riskList(state.occ);
        $('tRisk').innerHTML = '<thead><tr><th>Risco</th><th>Local</th><th>Nível</th><th>Ocorrências</th><th>Em aberto</th><th>Medida recomendada</th></tr></thead><tbody>' +
            (rs.length ? rs.map(r => {
                const g = GRAVS[r.nivel];
                return '<tr><td>' + esc(r.tipo) + '</td><td>' + esc(r.local) + '</td><td><span class="badge g-' + g + '">' + g + '</span></td><td>' + r.total + '</td><td>' + r.abertas + '</td><td class="desc">' + esc(state.med[r.tipo] || state.med['Outro'] || '') + '</td></tr>';
            }).join('') : '<tr><td colspan="6" class="empty">Nenhum risco identificado.</td></tr>') + '</tbody>';
    }
    function renderHist() {
        const fg = $('fGrav').value, fs = $('fSt').value, q = norm($('busca').value);
        const rows = sorted().filter(o => (!fg || o.grav === fg) && (!fs || o.status === fs) && (!q || norm(o.local + ' ' + o.tipo + ' ' + o.desc).indexOf(q) > -1));
        $('count').textContent = 'Mostrando ' + rows.length + ' de ' + state.occ.length + ' ocorrência(s).';
        $('tHist').innerHTML = '<thead><tr><th>ID</th><th>Data</th><th>Tipo</th><th>Local</th><th>Gravidade</th><th>Descrição</th><th>Andamento</th><th>Ações</th></tr></thead><tbody>' +
            (rows.length ? rows.map(o => {
                let h = '<tr><td>' + o.id + '</td><td>' + fmt(o.data) + '</td><td>' + esc(o.tipo) + '</td><td>' + esc(o.local) + '</td><td><span class="badge g-' + o.grav + '">' + o.grav + '</span></td><td class="desc">' + esc(o.desc) + '</td>' +
                    '<td><select data-st="' + o.id + '" aria-label="Andamento">' + STATUS.map(s => '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
                    '<td><button class="btn ghost sm" data-log="' + o.id + '">' + (openLogs.has(o.id) ? 'Ocultar registro' : 'Ver registro') + '</button> <button class="btn ghost sm" data-del="' + o.id + '">Excluir</button></td></tr>';
                if (openLogs.has(o.id)) {
                    const lg = state.hist.filter(x => x.ocorrenciaId === o.id).sort((a, b) => a.id - b.id);
                    h += '<tr class="logrow"><td colspan="8"><ul>' + lg.map(x => '<li>' + fmt(x.data) + ' – ' + esc(x.texto) + '</li>').join('') + '</ul></td></tr>';
                }
                return h;
            }).join('') : '<tr><td colspan="8" class="empty">Nenhum registro encontrado.</td></tr>') + '</tbody>';
    }
    async function renderBanco() {
        const names = ['ocorrencias', 'historico', 'medidas', 'meta'], rows = [];
        for (const n of names) {
            let info = {};
            const c = await run(DB, [n], 'readonly', tx => { const s = tx.objectStore(n); info = { key: s.keyPath, idx: Array.from(s.indexNames) }; return s.count() });
            rows.push('<tr><td><code>' + n + '</code></td><td><code>' + esc(info.key) + '</code></td><td>' + (info.idx.length ? info.idx.map(i => '<code>' + i + '</code>').join(', ') : '–') + '</td><td>' + c + '</td></tr>');
        }
        $('dbInfo').textContent = 'Banco "' + DB.name + '", versão ' + DB.version + '. Armazenado localmente no navegador, sem servidor.';
        $('tSchema').innerHTML = '<thead><tr><th>Tabela</th><th>Chave primária</th><th>Índices</th><th>Registros</th></tr></thead><tbody>' + rows.join('') + '</tbody>';
    }
    function renderAll() { renderDash(); renderRisk(); renderHist(); if (!$('banco').hidden) renderBanco() }

    /* ---------- navegação ---------- */
    const TITLES = { dash: 'Painel', reg: 'Registrar ocorrência', risk: 'Mapa de riscos', hist: 'Histórico', banco: 'Banco de dados', test: 'Testes' };
    function go(tab) {
        Object.keys(TITLES).forEach(t => { $(t).hidden = (t !== tab) });
        document.querySelectorAll('.menu button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current') });
        $('pageTitle').textContent = TITLES[tab];
        try { history.replaceState(null, '', '#' + tab) } catch (e) { }
        if (tab === 'banco' && DB) guard(renderBanco)();
        window.scrollTo(0, 0);
    }
    document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
    document.querySelector('[data-go]').addEventListener('click', e => go(e.currentTarget.dataset.go));

    /* ---------- formulário ---------- */
    $('tipo').innerHTML = '<option value="">Selecione</option>' + TIPOS.map(t => '<option>' + t + '</option>').join('');
    $('data').value = today(); $('data').max = today();
    function clearErrors() {
        document.querySelectorAll('#form .err').forEach(n => n.remove());
        document.querySelectorAll('#form .bad').forEach(n => n.classList.remove('bad'));
        $('fmsg').hidden = true;
    }
    function showErr(id, text) { const el = $(id); el.classList.add('bad'); const s = document.createElement('span'); s.className = 'err'; s.textContent = text; el.parentNode.appendChild(s) }
    function formMsg(ok, text) { $('fmsg').className = 'full alert ' + (ok ? 'ok' : 'no'); $('fmsg').textContent = text; $('fmsg').hidden = false }
    $('form').addEventListener('submit', async e => {
        e.preventDefault(); clearErrors();
        const d = { tipo: $('tipo').value, grav: $('grav').value, local: $('local').value, data: $('data').value, desc: $('desc').value };
        const errs = validate(d);
        if (Object.keys(errs).length) { Object.keys(errs).forEach(k => showErr(k, errs[k])); formMsg(false, 'Corrija os campos destacados.'); return }
        try {
            await addOcc(d); await refresh();
            $('form').reset(); $('data').value = today();
            formMsg(true, 'Ocorrência salva no banco de dados. Veja em Histórico.');
        } catch (err) {
            if (err && err.name === 'ConstraintError') formMsg(false, 'Esta ocorrência já está no banco (mesmo tipo, local, data e descrição).');
            else showError('Erro no banco de dados: ' + (err && err.message || err));
        }
    });

    /* ---------- histórico ---------- */
    $('tHist').addEventListener('change', guard(async e => {
        const id = e.target.getAttribute('data-st'); if (!id) return;
        await setStatus(Number(id), e.target.value); await refresh();
    }));
    $('tHist').addEventListener('click', guard(async e => {
        const del = e.target.getAttribute('data-del'), lg = e.target.getAttribute('data-log');
        if (lg) { const n = Number(lg); if (openLogs.has(n)) openLogs.delete(n); else openLogs.add(n); renderHist(); return }
        if (!del) return;
        if (!confirm('Excluir esta ocorrência do banco? Essa ação não pode ser desfeita.')) return;
        await delOcc(Number(del)); await refresh();
    }));
    ['fGrav', 'fSt', 'busca'].forEach(id => $(id).addEventListener('input', renderHist));

    /* ---------- testes ---------- */
    $('runTests').addEventListener('click', guard(async () => {
        const res = [], t = (n, ok) => res.push('<li class="' + (ok ? 'p' : 'f') + '">' + (ok ? 'Passou' : 'Falhou') + ': ' + n + '</li>');
        const base = { tipo: 'Queda', grav: 'Alta', local: 'Sala 1', data: '2026-01-10', desc: 'Descrição de teste válida.' };
        t('formulário vazio gera erro em todos os campos', Object.keys(validate({ tipo: '', grav: '', local: '', data: '', desc: '' })).length === 5);
        t('dados válidos não geram erro', Object.keys(validate(base)).length === 0);
        t('data futura é recusada', !!validate(Object.assign({}, base, { data: '2999-01-01' })).data);
        const s = stats([{ tipo: 'Queda', local: 'A', grav: 'Alta', status: 'Aberta' }, { tipo: 'Queda', local: 'A', grav: 'Baixa', status: 'Concluída' }, { tipo: 'Vazamento', local: 'B', grav: 'Crítica', status: 'Em andamento' }]);
        t('indicadores corretos (3 total, 2 altos, 2 pendentes, 2 riscos)', s.total === 3 && s.altos === 2 && s.pend === 2 && s.riscos === 2);
        const TN = 'riscozero-teste';
        const delDb = n => new Promise(r => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r() });
        try {
            await delDb(TN);
            let tdb = await openDb(TN, 1, createSchema);
            const rec = Object.assign({}, base, { status: 'Aberta' }); rec.chave = chaveOf(rec);
            await run(tdb, ['ocorrencias'], 'readwrite', tx => tx.objectStore('ocorrencias').add(rec));
            t('banco grava um registro', (await run(tdb, ['ocorrencias'], 'readonly', tx => tx.objectStore('ocorrencias').count())) === 1);
            let dup = false;
            try { await run(tdb, ['ocorrencias'], 'readwrite', tx => tx.objectStore('ocorrencias').add(Object.assign({}, rec))) } catch (e) { dup = e && e.name === 'ConstraintError' }
            t('banco recusa registro duplicado (índice único)', dup);
            tdb.close();
            tdb = await openDb(TN, 1, createSchema);
            t('registro persiste depois de fechar e reabrir o banco', (await run(tdb, ['ocorrencias'], 'readonly', tx => tx.objectStore('ocorrencias').count())) === 1);
            t('consulta por índice de gravidade encontra o registro', (await run(tdb, ['ocorrencias'], 'readonly', tx => tx.objectStore('ocorrencias').index('gravidade').getAll('Alta'))).length === 1);
            tdb.close(); await delDb(TN);
        } catch (e) { t('operações no banco de teste (' + (e && e.message || e) + ')', false) }
        t('banco principal aberto com ' + state.occ.length + ' ocorrência(s)', !!DB && (await getAll('ocorrencias')).length === state.occ.length);
        $('results').innerHTML = res.join('');
    }));

    /* ---------- rodapé ---------- */
    $('reset').addEventListener('click', guard(async () => { if (confirm('Substituir os dados atuais pelos exemplos?')) { await wipe(true); await refresh() } }));
    $('clear').addEventListener('click', guard(async () => { if (confirm('Apagar todas as ocorrências do banco?')) { await wipe(false); await refresh() } }));

    /* ---------- início ---------- */
    (async function init() {
        const h = (location.hash || '').replace('#', '');
        go(TITLES[h] ? h : 'dash');
        if (!window.indexedDB) { showError('Este navegador não oferece banco de dados local (IndexedDB).'); return }
        try {
            DB = await openDb(DBNAME, DBVER, (db, tx) => {
                createSchema(db);
                Object.keys(MEDIDAS).forEach(t => tx.objectStore('medidas').add({ tipo: t, texto: MEDIDAS[t] }));
                tx.objectStore('meta').add({ k: 'criadoEm', v: new Date().toISOString() });
                seedData(tx);
            });
            DB.onversionchange = () => DB.close();
            await refresh();
            if (h === 'banco') renderBanco();
        } catch (e) { showError('Não foi possível abrir o banco de dados: ' + (e && e.message || e)) }
    })();
})();