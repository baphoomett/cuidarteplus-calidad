#!/usr/bin/env bash
# Ejecuta las pruebas con cobertura y luego el análisis con sonar-scanner-cli en Docker.
# Uso: ./sonar-scan.sh            (pruebas + análisis)
#      SIN_PRUEBAS=1 ./sonar-scan.sh   (solo análisis, reutiliza la cobertura existente)
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .sonar-token ] && [ -z "${SONAR_TOKEN:-}" ]; then
  SONAR_TOKEN="$(cat .sonar-token)"
fi
: "${SONAR_TOKEN:?Define SONAR_TOKEN o crea el archivo .sonar-token}"

if [ -z "${SIN_PRUEBAS:-}" ]; then
  # Las pruebas de seguridad/usabilidad que fallan son hallazgos: no detienen el análisis
  (cd BACKEND && npx jest --coverage) || true
  (cd FRONTEND && npx vitest run --coverage) || true
fi

# Los lcov usan rutas relativas a cada paquete (src/...); se prefijan para SonarQube
for paquete in BACKEND FRONTEND; do
  if [ -f "$paquete/coverage/lcov.info" ]; then
    sed "s#^SF:\(src/\)#SF:$paquete/\1#" "$paquete/coverage/lcov.info" > "$paquete/coverage/lcov.sonar.info"
  fi
done

docker run --rm \
  --network sonar-network \
  -e SONAR_HOST_URL="http://cuidarteplus-sonarqube:9000" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$PWD:/usr/src" \
  sonarsource/sonar-scanner-cli
