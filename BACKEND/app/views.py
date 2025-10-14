import json
from http import HTTPStatus

from django.db.models import Max, Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Consultorio, ConsultorioExperience


def _load_payload(request):
    if request.content_type == "application/json":
        try:
            return json.loads(request.body or "{}")
        except json.JSONDecodeError:
            return None
    return request.POST.dict()


def _consultorio_to_dict(consultorio):
    return {
        "id": consultorio.id,
        "identifica": consultorio.identifica,
        "codigo_de": consultorio.codigo_de,
        "nombre_de": consultorio.nombre_de,
        "nombre_del": consultorio.nombre_del,
        "telefono": consultorio.telefono,
        "direccion": consultorio.direccion,
        "correo_ele": consultorio.correo_ele,
        "tipo_de_pr": consultorio.tipo_de_pr,
        "clase_de_p": consultorio.clase_de_p,
        "codigo_loc": consultorio.codigo_loc,
        "codigo_upz": consultorio.codigo_upz,
        "coordenada": consultorio.coordenada,
        "coordena_1": consultorio.coordena_1,
    }


def _experience_to_dict(experience):
    return {
        "id": experience.id,
        "consultorio": experience.consultorio_id,
        "author": experience.author,
        "comment": experience.comment,
        "rating": experience.rating,
        "created_at": experience.created_at.isoformat(),
        "consultorio_nombre": experience.consultorio.nombre_de,
    }


def _coerce_consultorio_value(field, value):
    if field in {"identifica", "codigo_loc", "codigo_upz"}:
        return int(value)
    if field in {"coordenada", "coordena_1"}:
        return float(value)
    return value


def _generate_identifiers():
    max_identifica = Consultorio.objects.aggregate(Max("identifica")).get("identifica__max") or 0
    new_identifica = max_identifica + 1
    codigo = f"C{new_identifica:06d}"
    return new_identifica, codigo


@require_http_methods(["GET"])
def geojson_consultorio(request):
    queryset = (
        Consultorio.objects
        .filter(coordenada__isnull=False, coordena_1__isnull=False)
        .exclude(coordenada=0)
        .exclude(coordena_1=0)
    )
    features = [
        {
            "type": "Feature",
            "properties": {
                "id": obj.id,
                "identifica": obj.identifica,
                "codigo_de": obj.codigo_de,
                "nombre_de_": obj.nombre_de,
                "nombre_del": obj.nombre_del,
                "telefono": obj.telefono,
                "dirección": obj.direccion,
                "correo_ele": obj.correo_ele,
                "tipo_de_Pr": obj.tipo_de_pr,
                "clase_de_P": obj.clase_de_p,
                "codigo_loc": obj.codigo_loc,
                "codigo_upz": obj.codigo_upz,
                "coordenada": obj.coordenada,
                "coordena_1": obj.coordena_1,
            },
            "geometry": {
                "type": "Point",
                "coordinates": [
                    obj.coordenada,
                    obj.coordena_1,
                ],
            },
        }
        for obj in queryset
    ]
    return JsonResponse({"type": "FeatureCollection", "features": features})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def consultorio_collection(request):
    if request.method == "GET":
        queryset = Consultorio.objects.all()

        tipo_prestador = request.GET.get("tipo_prestador")
        if tipo_prestador:
            queryset = queryset.filter(clase_de_p__iexact=tipo_prestador.strip())

        tipo_servicio = request.GET.get("tipo_servicio")
        if tipo_servicio:
            queryset = queryset.filter(tipo_de_pr__icontains=tipo_servicio.strip())

        localidad = request.GET.get("localidad")
        if localidad:
            try:
                queryset = queryset.filter(codigo_loc=int(localidad))
            except ValueError:
                return JsonResponse(
                    {"error": "La localidad debe ser numérica"},
                    status=HTTPStatus.BAD_REQUEST,
                )

        upz = request.GET.get("upz")
        if upz:
            try:
                queryset = queryset.filter(codigo_upz=int(upz))
            except ValueError:
                return JsonResponse(
                    {"error": "La UPZ debe ser numérica"},
                    status=HTTPStatus.BAD_REQUEST,
                )

        search = request.GET.get("q")
        if search:
            search = search.strip()
            queryset = queryset.filter(
                Q(nombre_de__icontains=search) | Q(direccion__icontains=search)
            )

        queryset = queryset.order_by("nombre_de")
        data = [_consultorio_to_dict(item) for item in queryset]
        return JsonResponse({"data": data}, status=HTTPStatus.OK)

    payload = _load_payload(request)
    if payload is None:
        return JsonResponse({"error": "JSON inválido"}, status=HTTPStatus.BAD_REQUEST)

    required = [
        "nombre_de",
        "nombre_del",
        "telefono",
        "direccion",
        "correo_ele",
        "tipo_de_pr",
        "clase_de_p",
        "codigo_loc",
        "codigo_upz",
        "coordenada",
        "coordena_1",
    ]
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        return JsonResponse(
            {"error": "Faltan datos obligatorios", "fields": missing},
            status=HTTPStatus.BAD_REQUEST,
        )

    field_names = {
        "nombre_de",
        "nombre_del",
        "telefono",
        "direccion",
        "correo_ele",
        "tipo_de_pr",
        "clase_de_p",
        "codigo_loc",
        "codigo_upz",
        "coordenada",
        "coordena_1",
    }
    try:
        data = {field: _coerce_consultorio_value(field, payload[field]) for field in field_names}
    except (TypeError, ValueError):
        return JsonResponse(
            {"error": "Datos de consultorio inválidos"},
            status=HTTPStatus.BAD_REQUEST,
        )
    identifica, codigo = _generate_identifiers()
    consultorio = Consultorio.objects.create(
        identifica=identifica,
        codigo_de=codigo,
        **data,
    )
    return JsonResponse(
        {"message": "Consultorio creado", "data": _consultorio_to_dict(consultorio)},
        status=HTTPStatus.CREATED,
    )


@csrf_exempt
@require_http_methods(["GET", "PATCH", "PUT"])
def consultorio_detail(request, pk):
    consultorio = get_object_or_404(Consultorio, pk=pk)

    if request.method == "GET":
        return JsonResponse({"data": _consultorio_to_dict(consultorio)}, status=HTTPStatus.OK)

    payload = _load_payload(request)
    if payload is None:
        return JsonResponse({"error": "JSON inválido"}, status=HTTPStatus.BAD_REQUEST)

    fields = {
        "nombre_de",
        "nombre_del",
        "telefono",
        "direccion",
        "correo_ele",
        "tipo_de_pr",
        "clase_de_p",
        "codigo_loc",
        "codigo_upz",
        "coordenada",
        "coordena_1",
    }
    for field, value in payload.items():
        if field in fields:
            try:
                setattr(consultorio, field, _coerce_consultorio_value(field, value))
            except (TypeError, ValueError):
                return JsonResponse(
                    {"error": f"Valor inválido para {field}"},
                    status=HTTPStatus.BAD_REQUEST,
                )
    consultorio.save()
    return JsonResponse(
        {"message": "Consultorio actualizado", "data": _consultorio_to_dict(consultorio)},
        status=HTTPStatus.OK,
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def experiencia_collection(request):
    if request.method == "GET":
        queryset = ConsultorioExperience.objects.select_related("consultorio").order_by("-created_at")
        data = [_experience_to_dict(item) for item in queryset]
        return JsonResponse({"data": data}, status=HTTPStatus.OK)

    payload = _load_payload(request)
    if payload is None:
        return JsonResponse({"error": "JSON inválido"}, status=HTTPStatus.BAD_REQUEST)

    required = ["consultorio", "author", "comment", "rating"]
    missing = [field for field in required if payload.get(field) in (None, "")]
    if missing:
        return JsonResponse(
            {"error": "Faltan datos obligatorios", "fields": missing},
            status=HTTPStatus.BAD_REQUEST,
        )

    consultorio = get_object_or_404(Consultorio, pk=payload["consultorio"])
    try:
        rating = int(payload["rating"])
    except (TypeError, ValueError):
        return JsonResponse(
            {"error": "La calificación debe ser un número entero"},
            status=HTTPStatus.BAD_REQUEST,
        )
    if rating < 1 or rating > 5:
        return JsonResponse(
            {"error": "La calificación debe estar entre 1 y 5"},
            status=HTTPStatus.BAD_REQUEST,
        )

    experience = ConsultorioExperience.objects.create(
        consultorio=consultorio,
        author=payload["author"],
        comment=payload["comment"],
        rating=rating,
    )
    return JsonResponse(
        {"message": "Experiencia registrada", "data": _experience_to_dict(experience)},
        status=HTTPStatus.CREATED,
    )
