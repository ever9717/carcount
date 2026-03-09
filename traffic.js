// Cloudflare Pages Function - API 路由
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Content-Type': 'application/json'
  };
  
  // OPTIONS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // 验证 API Key
    const apiKey = request.headers.get('X-API-Key') || url.searchParams.get('api_key');
    const validKeys = (env.API_KEYS || '').split(',').filter(k => k);
    
    if (validKeys.length > 0 && !validKeys.includes(apiKey)) {
      return new Response(JSON.stringify({
        status: 'error',
        error_code: 'UNAUTHORIZED',
        error_message: '无效的 API Key'
      }), { status: 401, headers: corsHeaders });
    }
    
    // 生成模拟数据
    const now = new Date();
    const hour = now.getUTCHours() + 8;
    
    const MONITOR_POINTS = [
      { id: 1, name: '兴莲乡政府路口', road: 'X345 县道', base_flow: 50 },
      { id: 2, name: '兴莲中学门口', road: '中心街', base_flow: 40 },
      { id: 3, name: '兴莲卫生院路口', road: '健康路', base_flow: 35 },
      { id: 4, name: '兴莲农贸市场', road: '市场路', base_flow: 60 },
      { id: 5, name: '兴莲高速路口', road: '高速连接线', base_flow: 120 },
      { id: 6, name: '兴莲加油站', road: 'G356 国道', base_flow: 100 },
      { id: 7, name: '兴莲小学路口', road: '教育路', base_flow: 35 },
      { id: 8, name: '兴莲客运站', road: '交通路', base_flow: 80 },
    ];
    
    // 时间因子
    let timeFactor = 1.0;
    if (hour >= 7 && hour <= 9) timeFactor = 1.5 + 0.5 * Math.sin((hour - 7) * Math.PI / 2);
    else if (hour >= 17 && hour <= 19) timeFactor = 1.8 + 0.5 * Math.sin((hour - 17) * Math.PI / 2);
    else if (hour >= 11 && hour <= 13) timeFactor = 1.2;
    else if (hour >= 0 && hour <= 6) timeFactor = 0.3;
    
    const monitorPoints = MONITOR_POINTS.map(point => {
      const flow = Math.floor(point.base_flow * timeFactor * (0.8 + Math.random() * 0.4));
      const congestion = Math.min(10, (flow / point.base_flow) * 3);
      const speed = congestion < 3 ? 40 + Math.random() * 20 : congestion < 6 ? 25 + Math.random() * 15 : 10 + Math.random() * 15;
      
      return {
        id: point.id,
        name: point.name,
        road: point.road,
        flow,
        congestion: Math.round(congestion * 10) / 10,
        speed: Math.round(speed * 10) / 10,
        update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    });
    
    const data = {
      status: 'success',
      mode: 'simulated',
      location: '兴国县兴莲乡',
      update_time: now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      monitor_points: monitorPoints,
      summary: {
        total_flow: monitorPoints.reduce((sum, p) => sum + p.flow, 0),
        avg_congestion: Math.round(monitorPoints.reduce((sum, p) => sum + p.congestion, 0) / 8 * 10) / 10,
        avg_speed: Math.round(monitorPoints.reduce((sum, p) => sum + p.speed, 0) / 8 * 10) / 10,
        peak_point: monitorPoints.reduce((max, p) => p.flow > max.flow ? p : max).name
      }
    };
    
    return new Response(JSON.stringify(data), { headers: corsHeaders });
    
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      error_message: error.message
    }), { status: 500, headers: corsHeaders });
  }
}
