#!/usr/bin/env python3
"""Serveur du jeu « Justice Au Choix » + espace admin.

Python 3 standard, aucune dépendance à installer.

    python3 server.py                  # http://localhost:8000 (jeu) et http://localhost:8000/admin
    python3 server.py --port 8080
    ADMIN_MOT_DE_PASSE=secret python3 server.py --hote 0.0.0.0   # admin protégé, accessible sur le réseau

Routes ajoutées au service de fichiers statiques :
    GET  /admin             page de l'espace admin (admin/index.html)
    GET  /api/images        liste des images disponibles (documents, personnages)
    PUT  /api/cas           remplace data/cas.json (une sauvegarde de l'ancien est gardée)
    POST /api/images?type=documents|personnages&nom=fichier.png   importe une image (corps = le fichier)
"""
import argparse
import base64
import hmac
import json
import os
import re
import time
import unicodedata
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

RACINE = Path(__file__).resolve().parent
FICHIER_CAS = RACINE / "data" / "cas.json"
DOSSIER_SAUVEGARDES = RACINE / "data" / "sauvegardes"
NB_SAUVEGARDES = 30
DOSSIERS_IMAGES = {"documents": "assets/documents_jeu", "personnages": "assets/characters"}
EXTENSIONS_LISTEES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
# Pas de SVG à l'import : un SVG peut contenir du script exécuté sur ce site.
SIGNATURES_IMPORT = {".png": b"\x89PNG\r\n\x1a\n", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".webp": b"RIFF"}
TAILLE_MAX_JSON = 2 * 1024 * 1024
TAILLE_MAX_IMAGE = 10 * 1024 * 1024
MOT_DE_PASSE = os.environ.get("ADMIN_MOT_DE_PASSE", "")


def slug(texte, defaut="image"):
    """« Lettre de M. Payet.png » -> « lettre-de-m-payet » (nom de fichier sûr)."""
    texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    texte = re.sub(r"[^a-z0-9]+", "-", texte.lower()).strip("-")
    return texte[:60] or defaut


class Gestionnaire(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RACINE), **kwargs)

    # --- utilitaires -------------------------------------------------------
    def chemin(self):
        return urlsplit(self.path).path

    def end_headers(self):
        # Les données et l'admin ne doivent jamais être servis depuis le cache :
        # une situation enregistrée doit apparaître à la partie suivante.
        if self.chemin().startswith(("/data/", "/api/", "/admin")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def repondre_json(self, code, objet):
        corps = json.dumps(objet, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def erreur(self, code, message):
        self.repondre_json(code, {"ok": False, "erreur": message})

    def autorise(self):
        """Sans ADMIN_MOT_DE_PASSE : ouvert (le serveur n'écoute que sur cette machine par défaut).
        Avec : authentification HTTP Basic (n'importe quel identifiant, ce mot de passe)."""
        if not MOT_DE_PASSE:
            return True
        entete = self.headers.get("Authorization", "")
        if entete.startswith("Basic "):
            try:
                mdp = base64.b64decode(entete[6:]).decode().partition(":")[2]
            except Exception:
                mdp = ""
            if hmac.compare_digest(mdp.encode(), MOT_DE_PASSE.encode()):
                return True
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Espace admin", charset="UTF-8"')
        self.send_header("Content-Length", "0")
        self.end_headers()
        return False

    def lire_corps(self, taille_max):
        try:
            taille = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.erreur(411, "Taille du contenu manquante.")
            return None
        if taille > taille_max:
            self.erreur(413, f"Fichier trop volumineux (maximum {taille_max // (1024 * 1024)} Mo).")
            return None
        return self.rfile.read(taille)

    def interdit(self, c):
        # Fichiers cachés (.git…), sauvegardes et code du serveur : jamais servis.
        return any(p.startswith(".") for p in c.split("/") if p) or c.startswith("/data/sauvegardes") or c == "/server.py"

    # --- GET ---------------------------------------------------------------
    def do_GET(self):
        c = self.chemin()
        if self.interdit(c):
            return self.send_error(404)
        if c.startswith(("/admin", "/api/")) and not self.autorise():
            return
        if c in ("/admin", "/admin/"):
            self.path = "/admin/index.html"
        if c == "/api/images":
            return self.lister_images()
        return super().do_GET()

    def do_HEAD(self):
        if self.interdit(self.chemin()):
            return self.send_error(404)
        return super().do_HEAD()

    def lister_images(self):
        resultat = {}
        for type_, dossier in DOSSIERS_IMAGES.items():
            d = RACINE / dossier
            resultat[type_] = sorted(
                f"{dossier}/{f.name}" for f in (d.iterdir() if d.is_dir() else [])
                if f.is_file() and f.suffix.lower() in EXTENSIONS_LISTEES
            )
        self.repondre_json(200, resultat)

    # --- PUT /api/cas ------------------------------------------------------
    def do_PUT(self):
        if self.chemin() != "/api/cas":
            return self.erreur(404, "Adresse inconnue.")
        if not self.autorise():
            return
        corps = self.lire_corps(TAILLE_MAX_JSON)
        if corps is None:
            return
        try:
            cas = json.loads(corps)
        except (ValueError, UnicodeDecodeError):
            return self.erreur(400, "Données illisibles (JSON invalide).")
        # Contrôle de structure seulement : une situation incomplète peut être enregistrée
        # (le jeu l'ignorera), pour ne jamais perdre le travail en cours.
        if not isinstance(cas, list) or not all(isinstance(x, dict) for x in cas):
            return self.erreur(400, "Le fichier doit contenir une liste de situations.")
        ids = [x.get("id") for x in cas]
        if not all(isinstance(i, str) and i.strip() for i in ids):
            return self.erreur(400, "Chaque situation doit avoir un identifiant.")
        if len(set(ids)) != len(ids):
            return self.erreur(400, "Deux situations ont le même identifiant.")
        self.sauvegarder_ancien()
        temporaire = FICHIER_CAS.with_suffix(".json.tmp")
        temporaire.write_text(json.dumps(cas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporaire, FICHIER_CAS)  # remplacement atomique : jamais de fichier à moitié écrit
        self.repondre_json(200, {"ok": True, "nombre": len(cas)})

    def sauvegarder_ancien(self):
        if not FICHIER_CAS.exists():
            return
        DOSSIER_SAUVEGARDES.mkdir(exist_ok=True)
        horodatage = time.strftime("%Y%m%d-%H%M%S")
        (DOSSIER_SAUVEGARDES / f"cas-{horodatage}.json").write_bytes(FICHIER_CAS.read_bytes())
        for vieux in sorted(DOSSIER_SAUVEGARDES.glob("cas-*.json"))[:-NB_SAUVEGARDES]:
            vieux.unlink()

    # --- POST /api/images --------------------------------------------------
    def do_POST(self):
        url = urlsplit(self.path)
        if url.path != "/api/images":
            return self.erreur(404, "Adresse inconnue.")
        if not self.autorise():
            return
        params = parse_qs(url.query)
        type_ = params.get("type", [""])[0]
        nom = params.get("nom", [""])[0]
        if type_ not in DOSSIERS_IMAGES:
            return self.erreur(400, "Type d'image inconnu.")
        ext = Path(nom).suffix.lower()
        if ext not in SIGNATURES_IMPORT:
            return self.erreur(400, "Format non accepté : utilisez une image PNG, JPEG ou WebP.")
        donnees = self.lire_corps(TAILLE_MAX_IMAGE)
        if donnees is None:
            return
        if not donnees.startswith(SIGNATURES_IMPORT[ext]) or (ext == ".webp" and donnees[8:12] != b"WEBP"):
            return self.erreur(400, "Ce fichier n'est pas une vraie image " + ext[1:].upper() + ".")
        dossier = RACINE / DOSSIERS_IMAGES[type_]
        dossier.mkdir(parents=True, exist_ok=True)
        base = slug(Path(nom).stem)
        cible, n = dossier / f"{base}{ext}", 2
        while cible.exists():  # ne jamais écraser une image existante
            cible, n = dossier / f"{base}-{n}{ext}", n + 1
        cible.write_bytes(donnees)
        self.repondre_json(201, {"ok": True, "chemin": f"{DOSSIERS_IMAGES[type_]}/{cible.name}"})


def main():
    parser = argparse.ArgumentParser(description="Serveur du jeu + espace admin")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--hote", default="127.0.0.1",
                        help="0.0.0.0 pour être joignable depuis le réseau (pensez à ADMIN_MOT_DE_PASSE)")
    args = parser.parse_args()
    serveur = ThreadingHTTPServer((args.hote, args.port), Gestionnaire)
    adresse = "localhost" if args.hote in ("127.0.0.1", "0.0.0.0") else args.hote
    print(f"Jeu          : http://{adresse}:{args.port}/")
    print(f"Espace admin : http://{adresse}:{args.port}/admin" + ("  (protégé par mot de passe)" if MOT_DE_PASSE else ""))
    print("Ctrl+C pour arrêter.")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
