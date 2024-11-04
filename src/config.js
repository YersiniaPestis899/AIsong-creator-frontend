const config = {
  apiBase: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000/api'
};

export default config;