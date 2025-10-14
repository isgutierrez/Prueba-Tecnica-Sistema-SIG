from django.contrib import admin
from django.urls import path

from .views import (
    consultorio_collection,
    consultorio_detail,
    experiencia_collection,
    geojson_consultorio,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('geojson/', geojson_consultorio, name='consultorios-geojson'),
    path('consultorios/', consultorio_collection, name='consultorios-collection'), # Añade un nuevo consultorio
    path('consultorios/<int:pk>/', consultorio_detail, name='consultorios-detail'), # Detalles de un consultorio específico
    path('experiencias/', experiencia_collection, name='experiencias-collection'), # Formulario de experiencia
]
