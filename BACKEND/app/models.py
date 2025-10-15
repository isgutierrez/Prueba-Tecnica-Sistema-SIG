from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator
from django.contrib.gis.db import models as gis_models

class Consultorio(models.Model):
    class Meta:
        db_table = 'consultorios'
        managed = False
    
    identifica = models.BigIntegerField()
    codigo_de = models.CharField(max_length=10, db_column='código_de')
    nombre_de = models.CharField(max_length=100, db_column='nombre_de_')
    nombre_del = models.CharField(max_length=100, db_column='nombre_del')
    telefono = models.CharField(max_length=50, db_column='teléfono')
    direccion = models.CharField(max_length=100, db_column='dirección')
    correo_ele = models.EmailField(db_column='correo_ele')
    tipo_de_pr = models.CharField(max_length=100, db_column='tipo_de_pr')
    clase_de_p = models.CharField(max_length=50, db_column='clase_de_p')
    codigo_loc = models.IntegerField(db_column='codigo_loc')
    codigo_upz = models.IntegerField(db_column='codigo_upz')
    coordenada = models.FloatField(db_column='coordenada')
    coordena_1 = models.FloatField(db_column='coordena_1')
    geom = gis_models.PointField(srid=4326, null=True, blank=True) #convierte el modelo en un modelo geoespacial de Django

    def __str__(self):
        return self.nombre_de


class ConsultorioExperience(models.Model):
    consultorio = models.ForeignKey(Consultorio, related_name="experiences", on_delete=models.CASCADE)
    author = models.CharField(max_length=120)
    comment = models.TextField()
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"] # Las experiencias más recientes primero

    def __str__(self):
        return f"{self.consultorio} · {self.rating}"
