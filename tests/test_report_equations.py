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
    blocks=pkg.document['blocks']
    assert any(b['type']=='equation' and r'\Delta s^{2}' in b['equation']['source'] for b in blocks)
    assert len(blocks)>=10
