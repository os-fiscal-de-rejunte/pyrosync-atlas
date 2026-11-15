import ctypes
import getpass
import json
import os
import sys
from ctypes import wintypes
from pathlib import Path

from dotenv import dotenv_values, load_dotenv


class Blob(ctypes.Structure):
    _fields_ = [("length", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_byte))]


def _crypt(data: bytes, decrypt: bool = False) -> bytes:
    if sys.platform != "win32":
        raise RuntimeError("O cofre local requer Windows; use variáveis de ambiente em outro sistema.")
    buffer = ctypes.create_string_buffer(data, len(data))
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    output = Blob()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if decrypt:
        ok = crypt32.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    else:
        ok = crypt32.CryptProtectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output))
    if not ok:
        raise ctypes.WinError()
    try:
        return ctypes.string_at(output.data, output.length)
    finally:
        kernel32.LocalFree(ctypes.cast(output.data, wintypes.HLOCAL))


def vault_path() -> Path:
    return Path(os.environ.get("LOCALAPPDATA", Path.home())) / "PyroSync" / "credentials.dpapi"


def load_credentials() -> None:
    load_dotenv()
    path = vault_path()
    if sys.platform == "win32" and path.exists():
        try:
            data = json.loads(_crypt(path.read_bytes(), decrypt=True))
            for key in ("DATABASE_URL", "GEMINI_API_KEY", "GROQ_API_KEY"):
                if data.get(key):
                    os.environ.setdefault(key, data[key])
        except (OSError, ValueError, RuntimeError):
            pass


def configure() -> None:
    previous = Path.home() / "OneDrive - Instituto J&F" / "Área de Trabalho" / "PYRO-RENDER" / "storage" / ".env"
    db = dotenv_values(previous).get("DATABASE_URL") if previous.exists() else None
    if not db:
        db = getpass.getpass("URL do banco (entrada oculta): ").strip()
    gemini = getpass.getpass("Chave Gemini (entrada oculta): ").strip()
    groq = getpass.getpass("Chave Groq (entrada oculta): ").strip()
    data = {"DATABASE_URL": db, "GEMINI_API_KEY": gemini, "GROQ_API_KEY": groq}
    path = vault_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_crypt(json.dumps(data, ensure_ascii=True).encode("utf-8")))
    print("Credenciais protegidas pelo Windows para o usuário atual.")


if __name__ == "__main__":
    configure()
