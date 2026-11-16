#!/usr/bin/env bash
# Déploie custom_components/oralink/ sur l'instance Home Assistant (mount CIFS).
#
# - `cp` fichier par fichier (le mount CIFS ne supporte pas le temp-file+rename
#   de rsync) ;
# - régénère les `.gz` à côté des assets JS : le serveur statique de HA sert
#   en priorité `<fichier>.gz` aux navigateurs qui acceptent gzip, donc un
#   `.gz` périmé masque silencieusement le nouveau bundle ;
# - vérifie que HA sert bien le nouveau bundle (en clair ET en gzip).
#
# Usage : scripts/deploy.sh [dossier_cible] [url_ha]
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)/custom_components/oralink"
DEST="${1:-/home/appuser/Perso/Oralink/Home-Assistant/oralink}"
HA_URL="${2:-http://192.168.1.134:8123}"

[ -d "$DEST" ] || { echo "Cible introuvable : $DEST (mount CIFS absent ?)" >&2; exit 1; }

cd "$SRC"
find . -type f ! -path '*/__pycache__/*' ! -name '*.gz' -print0 |
  while IFS= read -r -d '' f; do
    mkdir -p "$DEST/$(dirname "$f")"
    cp "$f" "$DEST/$f"
  done

for js in www/react-panel/livebox-panel-react.js www/tabs/topology.js; do
  [ -f "$js" ] || continue
  gzip -9 -n -c "$js" > "$DEST/$js.gz"
done

diff -rq --exclude=__pycache__ --exclude='*.gz' "$SRC" "$DEST" && echo "Fichiers identiques."

build=$(sed -nE 's/^_PANEL_BUILD = "([^"]+)".*/\1/p' __init__.py)
version=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
url="$HA_URL/livebox_panel/react-panel/livebox-panel-react.js?v=$version-$build"
want=$(md5sum < www/react-panel/livebox-panel-react.js | cut -d' ' -f1)
plain=$(curl -fsS -m 15 "$url" | md5sum | cut -d' ' -f1)
gz=$(curl -fsS -m 15 -H 'Accept-Encoding: gzip' "$url" | gunzip -c 2>/dev/null | md5sum | cut -d' ' -f1)
if [ "$plain" = "$want" ] && [ "$gz" = "$want" ]; then
  echo "OK : HA sert le bundle $build (clair + gzip)."
else
  echo "ATTENTION : bundle servi différent (attendu $want, clair $plain, gzip $gz)" >&2
  exit 1
fi
echo "Code Python modifié ? Redémarrer Home Assistant (recharger l'intégration ne réimporte pas les modules)."
