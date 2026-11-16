"""Contrôles statiques de cohérence backend ↔ panel (sans Home Assistant).

Ces tests ont été ajoutés après avoir trouvé :
- des handlers WS définis mais jamais enregistrés (type d'appareil forcé) ;
- des méthodes aiosysbus inexistantes (DMZ, niveau de pare-feu) ;
- des commandes d'écriture accessibles aux non-admins.
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / "custom_components" / "oralink"
PANEL_PY = (COMPONENT / "panel.py").read_text(encoding="utf-8")
PANEL_SRC = ROOT / "panel-src" / "src"

WRITE_SUFFIX = re.compile(
    r"/(set|add|delete|delete_all|remove|reset|toggle|run|reboot|factory_reset"
    r"|ring|kickstation|reconnect|scan_ips|discover)$"
)
# Commandes d'action volontairement ouvertes aux non-admins (cf. CLAUDE.md)
OPEN_ACTIONS = {"livebox/refresh", "livebox/device/wake", "livebox/tvdecoders/key"}


def _commands() -> dict[str, dict]:
    """type WS -> {func, admin, required} parsé depuis panel.py."""
    tree = ast.parse(PANEL_PY)
    result = {}
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        decorators = [ast.unparse(d) for d in node.decorator_list]
        command = next((d for d in decorators if "websocket_command" in d), None)
        if command is None:
            continue
        ws_type = re.search(r"'type'\)?:\s*'(livebox/[^']+)'", command).group(1)
        required = set(re.findall(r"vol\.Required\('(\w+)'", command)) - {"type"}
        result[ws_type] = {
            "func": node.name,
            "admin": any("require_admin" in d for d in decorators),
            "required": required,
        }
    return result


COMMANDS = _commands()


def test_every_handler_is_registered():
    registered = set(re.findall(r"async_register_command\(hass, (\w+)\)", PANEL_PY))
    handlers = {c["func"] for c in COMMANDS.values()}
    assert handlers - registered == set(), "handlers WS définis mais non enregistrés"
    assert registered - handlers == set()


def test_write_commands_require_admin():
    missing = [
        t for t, c in COMMANDS.items()
        if WRITE_SUFFIX.search(t) and t not in OPEN_ACTIONS and not c["admin"]
    ]
    assert missing == []


def _panel_calls():
    for path in PANEL_SRC.rglob("*.js*"):
        src = path.read_text(encoding="utf-8")
        for match in re.finditer(r'(?:type:\s*|useWsData\(\s*)"(livebox/[^"]+)"', src):
            yield path.name, match.group(1)


def test_panel_only_calls_existing_commands():
    unknown = sorted({(f, t) for f, t in _panel_calls() if t not in COMMANDS})
    assert unknown == []


def _aiosysbus_classes(src_dir: Path) -> dict[str, set[str]]:
    classes = {}
    for file in (src_dir / "api").glob("*.py"):
        for node in ast.parse(file.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.ClassDef):
                classes[node.name.lower()] = {
                    n.name for n in node.body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                }
    return classes


def _find_aiosysbus() -> Path | None:
    if env := os.environ.get("AIOSYSBUS_SRC"):
        return Path(env) if (Path(env) / "api").is_dir() else None
    try:
        import aiosysbus  # noqa: PLC0415
    except ImportError:
        return None
    return Path(aiosysbus.__file__).parent


@pytest.mark.skipif(_find_aiosysbus() is None, reason="aiosysbus absent (définir AIOSYSBUS_SRC)")
def test_aiosysbus_methods_exist():
    classes = _aiosysbus_classes(_find_aiosysbus())
    problems = []
    for file in COMPONENT.glob("*.py"):
        for lineno, line in enumerate(file.read_text(encoding="utf-8").splitlines(), 1):
            for attr, method in re.findall(r"api\.(\w+)\.(async_\w+)", line):
                if method not in classes.get(attr, set()):
                    problems.append(f"{file.name}:{lineno} api.{attr}.{method}")
    assert problems == []


def test_no_command_uses_reserved_id_field():
    """`id` est le numéro de message de l'enveloppe WebSocket HA : un paramètre
    homonyme est écrasé (bug trouvé sur livebox/dmz/set et wifi/schedule/set)."""
    assert re.findall(r'vol\.(?:Required|Optional)\(\s*"id"', PANEL_PY) == []


def _load_helper(name: str):
    """Extrait une fonction pure de panel.py (sans importer Home Assistant)."""
    tree = ast.parse(PANEL_PY)
    nodes = [n for n in tree.body if (
        isinstance(n, ast.FunctionDef) and n.name == name
    ) or (isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "_PROTOCOL_NUMBERS" for t in n.targets))]
    namespace: dict = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "panel_helpers", "exec"), namespace)
    return namespace[name]


def test_protocol_numbers():
    conv = _load_helper("_protocol_numbers")
    assert conv("TCP") == "6"
    assert conv("TCP/UDP") == "6,17"
    assert conv("6,17") == "6,17"
    assert conv("gre") == "47"
    assert conv("47") == "47"
    for bad in ("", "FOO", "300"):
        with pytest.raises(ValueError):
            conv(bad)


def test_led_percent():
    led = _load_helper("_led_percent")
    assert led({"Brightness": 254}) == 100
    assert led({"Brightness": 32}) == 13
    assert led({"Brightness": 0}) == 0
    assert led(None) is None
