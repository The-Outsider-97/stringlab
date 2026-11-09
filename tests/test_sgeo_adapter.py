"""Native scene adapter contract tests independent of the optional SLAI checkout.

These are fake facade tests, NOT evidence that installed SLAI native integration ran.
"""
import pytest
from stringlab import interop
from stringlab.physics import ModelError

class FakeDoc:
    @classmethod
    def from_bytes(cls, content, mode='read'):
        assert mode == 'read' and content == b'example-native-bytes'
        return cls()
    def validate(self, mode='strict', raise_on_error=True):
        assert mode=='strict' and raise_on_error
    def query_ids(self, *, type_name, limit=100, offset=0):
        return {'segment':['seg-1'] if offset==0 else [], 'box':['box-1']}.get(type_name,[])
    def get(self, oid):
        assert oid=='seg-1'
        return {'geometry':{'kind':'segment','start':[0,0,0],'end':[1,2,3]}}
    def to_mesh(self):
        return {'vertices':[[0,0,0],[1,0,0],[0,1,0]],'faces':[[0,1,2]]}
    def inspect(self): return {'unit':'mm'}


def test_native_sgeo_adapter_uses_façade_methods(monkeypatch):
    monkeypatch.setattr(interop,'_sgeo',lambda:FakeDoc)
    snapshot=interop.load_native_sgeo_scene(b'example-native-bytes')
    assert snapshot['format']=='slai.sgeo'
    assert snapshot['source']=='canonical_import'
    assert snapshot['segments']==[{'id':'seg-1','start':[0,0,0],'end':[1,2,3]}]
    assert snapshot['mesh']['faces']==[[0,1,2]]
    assert snapshot['units']=='mm'
    assert snapshot['valid_native_document'] is True


def test_native_sgeo_adapter_rejects_invalid_or_unsupported_payload(monkeypatch):
    monkeypatch.setattr(interop,'_sgeo',lambda:FakeDoc)
    with pytest.raises(ModelError):interop.load_native_sgeo_scene(b'bad')
    class BadDoc(FakeDoc):
        @classmethod
        def from_bytes(cls,content, mode='read'):raise ValueError('Invalid package')
    monkeypatch.setattr(interop,'_sgeo',lambda:BadDoc)
    with pytest.raises(ModelError,match='Canonical SGEO scene could not be decoded'):
        interop.load_native_sgeo_scene(b'example-native-bytes')
