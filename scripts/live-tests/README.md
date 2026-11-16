# Tests sur box réelle

Comparent ce qu'affiche Oralink (via le WebSocket de Home Assistant) avec ce
que renvoie directement la Livebox, et testent les écritures **réversibles**
(chaque modification est vérifiée sur la box puis annulée). Jamais de reboot,
reset, restauration, coupure Wi-Fi ou reconnexion WAN.

Identifiants uniquement par variables d'environnement (jamais dans les fichiers) :
`HA_USER`, `HA_PASS` (compte HA admin), `LB_USER`, `LB_PASS` (admin Livebox).

```sh
cd scripts/live-tests
READS=livebox/devices,livebox/dhcp,...   # liste des commandes de lecture
node dump_reads.mjs "$READS" oralink_reads.json   # données vues par Oralink
python3 -I fetch_box.py                            # données brutes de la box → box_raw.json
python3 -I compare.py                              # comparaison champ par champ
node write_tests.mjs                               # écritures réversibles
CHROME=~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome \
  node browser_check.mjs                           # panel dans un vrai Chromium (onglets, erreurs console)
node wifi_config_test.mjs                          # éditeur Wi-Fi (réseaux désactivés uniquement)
ENTRY_ID=<id> OUT=diag.json node diag_check.mjs    # télécharge les diagnostics HA pour y chercher des secrets
```

Les fichiers `*.json` générés contiennent des données du réseau local : ne pas
les committer.
