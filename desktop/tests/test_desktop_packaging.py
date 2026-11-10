"""Non-Windows contract checks for StringLab's Tauri/PyInstaller desktop bridge."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import sys
import tomllib

HERE = Path(__file__).resolve().parents[2]


def load(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tauri_conf_does_not_grant_remote_permissions():
    config = json.loads((HERE / 'src-tauri/tauri.conf.json').read_text())
    windows = json.loads((HERE / 'src-tauri/tauri.windows.conf.json').read_text())
    caps = json.loads((HERE / 'src-tauri/capabilities/default.json').read_text())
    assert config['identifier'] == 'com.slai.stringlab'
    assert config['build']['frontendDist'] == '../desktop/loading'
    assert caps['local'] is True
    assert not any('shell' in p or 'fs:' in p for p in caps['permissions'])
    assert windows['bundle']['resources']['../desktop/backend-dist/stringlab-backend/'] == 'backend/'
    assert config['bundle']['targets'] == ['nsis']
    assert tomllib.loads((HERE / 'src-tauri/Cargo.toml').read_text())['dependencies']['tauri']['version'] == '2'


def test_backend_invocation_has_no_embedded_personal_paths():
    builder = load(HERE / 'desktop/build_backend.py')
    line = builder.command()
    assert '--onedir' in line and '--onefile' not in line
    assert '--console' in line
    assert '--paths' in line
    assert '--hidden-import' in line
    assert 'src.utils.sldc' in line
    assert 'src.agents.animation_agent' in line
    assert str(builder.ENTRY) == line[-1]
    assert '--add-data' in line
    assert not any('G:\\GAIA' in arg for arg in line)


def test_nonfrozen_launcher_preserves_command_line(monkeypatch):
    entry = load(HERE / 'desktop/backend_entry.py')
    monkeypatch.delattr(sys, 'frozen', raising=False)
    assert entry.forwarded_arguments(['--check', '--port', '8776']) == ['--check', '--port', '8776']


def test_frozen_launcher_provides_slai_root_and_static_files(monkeypatch, tmp_path):
    entry = load(HERE / 'desktop/backend_entry.py')
    for rel in ('src/utils/sldc.py', 'applications/stringlab/dist/index.html', 'applications/stringlab/configs/config.yaml'):
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text('fixture')
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, '_MEIPASS', str(tmp_path), raising=False)
    args = entry.forwarded_arguments(['--port', '1234', '--no-browser'])
    assert args[0:2] == ['--slai-root', str(tmp_path)]
    assert ['--client-dir', str(tmp_path / 'applications/stringlab/dist')] == args[2:4]
    assert args[-3:] == ['--port', '1234', '--no-browser']