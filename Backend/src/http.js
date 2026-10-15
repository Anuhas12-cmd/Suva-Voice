const UNIQUE = {
  users_email_key: 'An account with this email already exists',
  users_phone_key: 'An account with this phone number already exists',
  call_records_one_live_per_elderly: 'A call is already in progress for this person',
  call_records_one_retry_per_group: 'A retry is already scheduled for this call',
  subscriptions_one_active: 'This customer already has an active subscription',
  care_orders_number_key: 'That order number is already in use',
  payments_ref_key: 'That transaction reference already exists',
  subscription_plans_code_key: 'A plan with this code already exists'
};

export function httpError(status, message, extras = {}) {
  const error = new Error(message);
  error.status = status;
  error.errorCode = extras.code;
  error.details = extras.details;
  return error;
}

export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          message: 'Please check the highlighted information',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message
          }))
        }
      });
    }
    req[source] = parsed.data;
    next();
  };
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (!err.status && err.code === '23505') {
    return res.status(409).json({
      error: { message: UNIQUE[err.constraint] || 'This record already exists' }
    });
  }
  if (!err.status && err.code === '22P02') {
    return res.status(400).json({ error: { message: 'One of the values is not valid' } });
  }
  if (!err.status && err.code === '23503') {
    return res.status(400).json({ error: { message: 'That related record was not found' } });
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error(new Date().toISOString(), err);
  }
  return res.status(status).json({
    error: {
      message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
      code: err.errorCode,
      details: err.details
    }
  });
}
