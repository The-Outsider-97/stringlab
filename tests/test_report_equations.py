from io import BytesIO
import pytest
from stringlab.physics import template
from stringlab.reports import pdf_report, sldc_report


def test_report_uses_real_unicode_mathematics():
    from pypdf import PdfReader
    content=PdfReader(BytesIO(pdf_report(template('open')))).pages[0].extract_text()
    assert 'Δs²' in content
    assert '∂²Yⁱ/∂τ²' in content
    assert 'ds^2' not in content


def test_native_sldc_equations_round_trip_if_available():
    sldc=pytest.importorskip('src.utils.sldc')
    raw=sldc_report(template('open'))
    pkg=sldc.loads_package(raw)
    assert pkg.version == '1.1.0'
    blocks=pkg.document['blocks']
    assert any(b['type']=='equation' and r'\Delta s^{2}' in b['equation']['source'] for b in blocks)
    assert len(blocks)>=10


def test_native_sldc_scientific_feature_uses_explicit_version(monkeypatch):
    """Regression for the actual SLAI scientific-feature version boundary.

    The real-library round-trip test above runs in a full SLAI checkout.
    This contract test also runs in a standalone StringLab installation.
    """
    import sys
    import types
    from types import SimpleNamespace

    sldc = types.ModuleType('src.utils.sldc')

    def make_block(kind, text, **kwargs):
        return {'type': kind, 'text': text, **kwargs}

    def make_equation(source):
        return {'type': 'equation', 'equation': {'source': source}}

    def make_table(rows, **kwargs):
        return {'type': 'table', 'table': {'rows': rows}, **kwargs}

    def new_package(title, blocks):
        return SimpleNamespace(version='1.0.0', document={'title': title, 'blocks': blocks})

    def validate_package(pkg):
        if any(b['type'] == 'equation' for b in pkg.document['blocks']):
            if pkg.version != '1.1.0':
                raise ValueError('SLDC 1.1 features require an explicit upgrade of package.version')

    def dumps_package(pkg):
        validate_package(pkg)
        return b'validated-native-SLDC'

    sldc.make_block = make_block
    sldc.make_equation = make_equation
    sldc.make_table = make_table
    sldc.new_package = new_package
    sldc.validate_package = validate_package
    sldc.dumps_package = dumps_package
    utils = types.ModuleType('src.utils')
    utils.__path__ = []
    utils.sldc = sldc
    monkeypatch.setitem(sys.modules, 'src.utils', utils)
    monkeypatch.setitem(sys.modules, 'src.utils.sldc', sldc)

    assert sldc_report(template('open')) == b'validated-native-SLDC'
