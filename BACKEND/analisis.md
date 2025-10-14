# Análisis del backend (PRUEBA_TEC_SIG)

## Visión general
- Proyecto Django 5.1 con aplicaciones `app` (núcleo) y `api` (vacía).
- Se pretende exponer datos geográficos (`Consultorio`) pero la pila GeoDjango y Django REST Framework están subutilizadas.
- No hay tests automatizados ni documentación técnica.

## Fortalezas detectadas
- Uso explícito de `db_table` para mapear a tablas existentes (`app/models.py:3`).
- Serialización manual a GeoJSON comprensible (`app/views.py:4`-`38`).
- Inclusión temprana de dependencias geoespaciales (`django.contrib.gis`, GDAL/GEOS/PROJ) en `INSTALLED_APPS` (`app/settings.py:33`-`45`).

## Áreas de mejora prioritarias

### Configuración y despliegue
- **Gestiona configuraciones por entorno**: descompón `settings.py` en `settings/base.py` + `dev.py` + `prod.py`, cargando valores con `django-environ` o `pydantic-settings`. Esto habilita toggles por entorno (DEBUG, logging, cache) y te acerca a la filosofía 12 Factor.
- **Secretos y credenciales fuera del repositorio**: `SECRET_KEY`, datos de Postgres y banderas sensibles (`app/settings.py:22`-`95`) deben provenir de variables de entorno o un secret manager. Define un `.env.example` y añade validaciones en el arranque para fallar rápido cuando falte alguna clave.
- **Política CORS coherente**: evitar `CORS_ALLOW_ALL_ORIGINS = True` cuando ya existe una lista blanca (`app/settings.py:78`-`82`). Configura `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_CREDENTIALS` y encabezados permitidos de acuerdo al frontend real, y documenta el proceso para agregar nuevos orígenes.
- **Dependencias GIS portables**: las rutas hardcodeadas (`app/settings.py:140`-`149`) fallan fuera de macOS ARM. Lee los paths desde env, detecta el SO en tiempo de arranque o usa contenedores (Docker) con una imagen base que ya incluya GDAL/GEOS/PROJ.
- **Preparación para despliegue**: agrega ajustes de producción (`ALLOWED_HOSTS`, `SECURE_` headers, `SESSION_COOKIE_SECURE`, caché, almacenamiento de estáticos en CDN) y scripts de infraestructura (Dockerfile, docker-compose, Terraform) para demostrar que el proyecto está listo para cloud.

### Diseño de la aplicación
- **Define límites claros entre apps**: la app `api` está vacía y la lógica vive en `app`. Decide si `api` será la capa de exposición REST y mueve allí vistas, serializers y urls. De lo contrario, elimínala para mantener un dominio cohesivo.
- **Estructura modular y nombres expresivos**: renombra el proyecto `app` a algo alineado al dominio (por ejemplo, `core` o `backend`) y crea submódulos dedicados (`core/models.py`, `consultorios/serializers.py`, `consultorios/services.py`) para evitar imports frágiles y facilitar testing.
- **Introduce capas de servicio y serialización**: encapsula reglas de negocio en servicios/repositorios y usa DRF `ViewSet` + `Router`. Esto reduce duplicación, facilita versionar APIs y permite aplicar políticas (permisos, throttling) de forma consistente.
- **Configura `AppConfig` y señalización**: personaliza `apps.py` con `verbose_name`, registro de señales y hooks de arranque (por ejemplo, validar dependencias GIS). Esto muestra una visión senior del ciclo de vida de la app.
- **Documenta contratos**: agrega esquemas (p. ej. OpenAPI/Swagger con `drf-spectacular`) y README's por app explicando responsabilidades, dependencias y puntos de extensión.

### Modelado de datos geoespaciales
- **Usa tipos geoespaciales nativos**: cambia los `FloatField` por `django.contrib.gis.db.models.PointField(srid=4326)` (`app/models.py:18`-`19`). Esto habilita validaciones automáticas, consultas espaciales (`distance`, `within`) y soporte directo en PostGIS.
- **Normaliza nomenclatura y compatibilidad**: los `db_column` con tildes (`app/models.py:8`-`12`) pueden quedarse para mapear tablas legadas, pero expón propiedades limpias (`@property` o `SerializerMethodField`) y documenta la convención en el modelo.
- **Valida calidad de datos**: implementa `clean()` o señales `pre_save` para asegurarte de que las coordenadas estén en el orden correcto (lon, lat), dentro del rango permitido y con SRID consistente. Compleméntalo con constraints (`CheckConstraint`) en la DB.
- **Enriquece el metadata**: añade `verbose_name`, `help_text`, `db_index=True` y constraints (`UniqueConstraint`, índices GiST/GIN para geometría) para mejorar las consultas y la experiencia en admin.
- **Optimiza ingestión**: si importas lotes masivos, crea comandos de management o pipelines ETL que transformen las columnas originales (con acentos) al modelo de dominio antes de guardarlas. Esto garantiza trazabilidad y evita inconsistencias silenciosas.

### Capa de vistas y entrega de datos
- **Vista funcional sin control de métodos** (`app/views.py:4`-`38`). Protege con `@require_http_methods(["GET"])` o migra a DRF (`APIView`/`ViewSet`).
- **Sin manejo de errores**: una excepción en la BD devuelve 500 crudo. En DRF podrías capturar y responder con mensajes estructurados.
- **Serialización manual**: usa `rest_framework_gis` o `GeoFeatureModelSerializer` para generar GeoJSON validado y reutilizable.
- **Coordenadas invertidas**: verifica que `coordenada` sea longitud y `coordena_1` latitud. GeoJSON exige `[lon, lat]`. Documenta o renombra para evitar ambigüedad.
- **Nombres de propiedades no consistentes** (mezcla snake_case y nombres con tilde). Define convención clara (p. ej. snake_case en inglés) y aplica transformaciones al serializar.
- **Sin paginación ni filtros**: `Consultorio.objects.all()` puede explotar memoria. Añade filtros (query params) y paginación o límites.
- **`JsonResponse` sin `safe=False`**: actualmente devuelves un diccionario, está bien. Si migras a lista de Features necesitarás `safe=False`.

### Ruteo y organización
- Import duplicado en `app/urls.py:18`-`19`. Limpia y agrupa rutas en módulos por dominio (p. ej. `api/urls.py`).
- Añade documentación de endpoints y versionado (`/api/v1/...`).
- Habilita `include()` para mantener URLs de la app separadas del proyecto principal.

### Seguridad
- Configura `ALLOWED_HOSTS` y políticas de CSRF apropiadas para frontend productivo.
- Añade cabeceras de seguridad (`SECURE_*`, `SESSION_COOKIE_SECURE`) cuando despliegues.
- Evalúa autenticación/autorización si el endpoint no debe ser público; DRF facilita JWT/Token.

### Calidad y pruebas
- **Sin pruebas** (`api/tests.py:1`-`3`). Implementa tests de modelo, serialización y endpoints (Django TestCase o pytest + pytest-django).
- **Sin linting/formato automático**: integra `ruff`/`black`/`isort`.
- Documenta requisitos (`requirements.txt` o `pyproject.toml`) y scripts (Makefile/`manage.py` commands).
- Configura CI (GitHub Actions) que ejecute lint + tests + migra lint (`makemigrations --check`).

### Observabilidad y mantenimiento
- Configura logging estructurado en `settings` (`LOGGING` dict) y usa `logging.getLogger()` en vistas.
- Implementa métricas simples (tiempo de respuesta) o integra Sentry para excepciones.
- Añade comentarios/README describiendo arquitectura, flujo de datos y pasos para levantar el entorno (incluye PostGIS + datos).

## Roadmap sugerido (senior)
1. **Refactorizar configuración**: settings por entorno, variables de entorno, requisitos explícitos.
2. **Reorganizar apps**: renombrar proyecto, mover lógica de API a una app REST dedicada y borrar código muerto.
3. **Migrar a DRF + GeoDjango**: crear `GeoFeatureModelSerializer`, `ViewSet` con filtros/paginación, endpoint versionado.
4. **Fortalecer modelo de datos**: `PointField`, validaciones, constraints, `clean()` para normalizar datos.
5. **Añadir cobertura de pruebas**: unitarias para el modelo, tests de API y snapshot GeoJSON.
6. **Automatizar calidad**: linting, formateo y pipeline CI.
7. **Documentación y DX**: README, scripts (`make dev`, `make test`), guía de ingestión de datos, convenciones de estilo.

Al completar estos puntos, el backend lucirá y se comportará como un proyecto senior listo para una prueba técnica exigente.
