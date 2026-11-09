from __future__ import annotations

import csv
import io
import json
import sys
import types

import pytest

from stringlab.physics import ModelError, template
from stringlab.reports import csv_series, json_snapshot, pdf_report
from stringlab.store import ExperimentStore


def test_csv_time_series_and_json():
    c=template('open')
    data=csv_series(c,10).decode()
    rows=list(csv.reader(io.StringIO(data)))
    assert len(rows)==11
    obj=json.loads(json_snapshot(c,.2))
    assert obj['format'].endswith('(NOT SGEO)')
    assert obj['frame']['time']==.2


def test_reportlab_report_contains_valid_pdf():
    content=pdf_report(template('open'))
    assert content.startswith(b'%PDF-')
    from pypdf import PdfReader
    page=PdfReader(io.BytesIO(content)).pages[0]
    assert 'StringLab' in page.extract_text()


def test_revision_safe_local_storage(tmp_path, monkeypatch):
    # Store uses the real SLAI shared atomic-write contract in production;
    # inject a minimal test double only because the checkout is unavailable here.
    pkg=types.ModuleType('applications');pkg.__path__=[]
    tools=types.ModuleType('applications.tools');tools.__path__=[]
    storage=types.ModuleType('applications.tools.storage')
    def atomic_write_json(path, data):
        import os
        temp=path.with_suffix('.tmp')
        temp.write_text(json.dumps(data), encoding='utf-8')
        os.replace(temp,path)
    storage.atomic_write_json=atomic_write_json
    monkeypatch.setitem(sys.modules,'applications',pkg)
    monkeypatch.setitem(sys.modules,'applications.tools',tools)
    monkeypatch.setitem(sys.modules,'applications.tools.storage',storage)
    store=ExperimentStore(tmp_path)
    c=template('open')
    first=store.save({'title':'Case A','configuration':c,'expected_revision':0})
    assert first['revision']==1
    assert store.read(first['id'])['configuration']['kind']=='open'
    with pytest.raises(ModelError,match='Revision conflict'):
        store.save({'id':first['id'],'title':'Old','configuration':c,'expected_revision':0})
    newer=store.save({'id':first['id'],'title':'New','configuration':c,'expected_revision':1})
    assert newer['revision']==2
    assert len(store.list())==1
    store.delete(first['id'])
    assert store.list()==[]
    with pytest.raises(ModelError):store.read('../escape')


def test_quantum_state_persists_in_saved_experiment(tmp_path, monkeypatch):
    pkg=types.ModuleType('applications');pkg.__path__=[]
    tools=types.ModuleType('applications.tools');tools.__path__=[]
    storage=types.ModuleType('applications.tools.storage')
    storage.atomic_write_json=lambda path, obj: path.write_text(json.dumps(obj),encoding='utf-8')
    monkeypatch.setitem(sys.modules,'applications',pkg)
    monkeypatch.setitem(sys.modules,'applications.tools',tools)
    monkeypatch.setitem(sys.modules,'applications.tools.storage',storage)
    from stringlab.quantum import quantum_template
    q=quantum_template()
    q['radius']=3.25
    store=ExperimentStore(tmp_path)
    item=store.save({'title':'T-dual setup','configuration':template('closed'),'quantum':q})
    assert store.read(item['id'])['quantum']['radius']==3.25


def test_extended_solver_config_persists_and_is_validated(tmp_path, monkeypatch):
    pkg=types.ModuleType('applications');pkg.__path__=[]
    tools=types.ModuleType('applications.tools');tools.__path__=[]
    storage=types.ModuleType('applications.tools.storage')
    storage.atomic_write_json=lambda path, obj: path.write_text(json.dumps(obj),encoding='utf-8')
    for name,module in [('applications',pkg),('applications.tools',tools),('applications.tools.storage',storage)]:
        monkeypatch.setitem(sys.modules,name,module)
    store=ExperimentStore(tmp_path)
    numerical={'model':'nambu_goto','kind':'open','points':64,'frames':16,'duration':1.,'amplitude':.3,'hubble':.04,'electric':0.}
    original=store.save({'title':'Expanding NG','configuration':template('open'),'numerical':numerical})
    got=store.read(original['id'])
    assert got['numerical']['hubble']==.04
    assert got['provenance']['category']=='covariant or nonlinear numerical PDE'
    with pytest.raises(ModelError,match='Unknown numerical solver'):
        store.save({'title':'Bad','configuration':template('open'),'numerical':{'model':'not-simulation'}})
    with pytest.raises(ModelError):
        store.save({'title':'Oversized','configuration':template('open'),
                    'numerical':{**numerical,'points':100000}})
