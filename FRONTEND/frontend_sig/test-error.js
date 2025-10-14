const err = {
  status: 400,
  message: 'Bad Request',
  error: {
    detail: 'Latitud inválida',
    latitud: ['Este campo es obligatorio'],
    coordenadas: ['Formato incorrecto', 'Debe ser [longitud, latitud]']
  }
};

const fallback = 'No fue posible guardar el consultorio. Revisa los datos e inténtalo nuevamente.';

function formatConsultorioError(err) {
  if (!err || typeof err !== 'object') return fallback;
  const httpError = err;
  const { status, error } = httpError;

  const errorMessages = [];
  if (error) {
    if (typeof error === 'string') {
      errorMessages.push(error);
    } else if (typeof error === 'object') {
      if (typeof error.detail === 'string') {
        errorMessages.push(error.detail);
      }
      if (Array.isArray(error.errors)) {
        error.errors.forEach((e) => {
          if (typeof e === 'string') errorMessages.push(e);
          else if (e && typeof e.message === 'string') errorMessages.push(e.message);
        });
      }
      Object.entries(error).forEach(([key, value]) => {
        if (key === 'detail' || key === 'errors') return;
        if (typeof value === 'string') {
          errorMessages.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
          value.forEach((item) => {
            if (typeof item === 'string') {
              errorMessages.push(`${key}: ${item}`);
            } else if (item && typeof item.message === 'string') {
              errorMessages.push(`${key}: ${item.message}`);
            }
          });
        }
      });
    }
  }

  if (!errorMessages.length && typeof httpError.message === 'string') {
    errorMessages.push(httpError.message);
  }

  if (!errorMessages.length && typeof status === 'number') {
    if (status >= 500) {
      errorMessages.push('El servidor encontró un problema. Intenta nuevamente más tarde.');
    } else if (status === 0) {
      errorMessages.push('No se pudo contactar el servidor. Verifica tu conexión o CORS.');
    }
  }

  return errorMessages.length ? errorMessages.join('\n') : fallback;
}