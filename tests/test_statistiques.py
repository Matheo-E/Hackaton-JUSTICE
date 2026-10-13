"""python3 -m unittest discover -s tests"""
import io
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import server


class StatistiquesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / 'data').mkdir()
        self.cas = root / 'data/cas.json'
        self.cas.write_text(json.dumps([{'id': 'voisins', 'explication': 'Discussion'}]))
        (root / 'data/modes.json').write_text(json.dumps([{'id': 'amiable'}, {'id': 'mediateur'}]))
        for name, value in [('RACINE', root), ('FICHIER_CAS', self.cas),
                            ('FICHIER_STATISTIQUES', root / '.statistiques.sqlite3')]:
            p = patch.object(server, name, value)
            p.start()
            self.addCleanup(p.stop)

    def test_comptage_persistant_et_sans_doublons(self):
        self.assertEqual(server.statistiques_cas('voisins')['total'], 0)
        for _ in range(3):
            server.statistiques_cas('voisins', 'amiable', 'a' * 32)
        server.statistiques_cas('voisins', 'mediateur', 'b' * 32)
        self.assertEqual(server.statistiques_cas('voisins')['choix'], {'amiable': 1, 'mediateur': 1})
        # Un nouvel envoi avec un autre choix conserve la participation initiale.
        server.statistiques_cas('voisins', 'mediateur', 'a' * 32)
        self.assertEqual(server.statistiques_cas('voisins')['total'], 2)

    def test_ecritures_concurrentes(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda n: server.statistiques_cas('voisins', 'amiable', f'{n:032x}'), range(24)))
        self.assertEqual(server.statistiques_cas('voisins')['total'], 24)

    def test_dossier_modifie_ne_reutilise_pas_anciens_votes(self):
        server.statistiques_cas('voisins', 'amiable', 'a' * 32)
        self.cas.write_text(json.dumps([{'id': 'voisins', 'explication': 'Autre situation'}]))
        self.assertEqual(server.statistiques_cas('voisins')['total'], 0)

    def handler(self, path, body=b''):
        h = object.__new__(server.Gestionnaire)
        h.path, h.rfile = path, io.BytesIO(body)
        h.headers = {'Content-Length': str(len(body))}
        h.repondre_json = lambda code, data: setattr(h, 'resultat', (code, data))
        h.autorise = lambda: self.fail('Les statistiques publiques ne demandent pas le mot de passe admin')
        return h

    def test_routes_publiques_et_validation(self):
        h = self.handler('/api/statistiques', json.dumps({'cas_id': 'voisins', 'choix': 'amiable', 'participation': 'a' * 32}).encode())
        h.do_POST()
        self.assertEqual(h.resultat[0], 200)
        h = self.handler('/api/statistiques?cas_id=voisins')
        h.do_GET()
        self.assertEqual(h.resultat[1]['total'], 1)
        for body in [b'[]', b'null', b'{', b'{"cas_id":"voisins","choix":"autre"}',
                     b'{"cas_id":"voisins","choix":"amiable","participation":"court"}']:
            h = self.handler('/api/statistiques', body)
            h.do_POST()
            self.assertEqual(h.resultat[0], 400)
        h = self.handler('/api/statistiques?cas_id=inconnu')
        h.do_GET()
        self.assertEqual(h.resultat[0], 400)

    def test_base_cachee_meme_avec_chemin_encode(self):
        h = self.handler('/%2estatistiques.sqlite3')
        self.assertTrue(h.interdit(h.chemin()))


if __name__ == '__main__':
    unittest.main()
