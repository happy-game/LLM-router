// 声明 ServiceWorker 相关的类型
declare const self: ServiceWorkerGlobalScope & {
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
};

// 定义 URL 映射接口
interface TargetUrlMap {
  [key: string]: string;
  openai: string;
  deepseek: string;
  gemini: string;
  default: string;
}

// 定义请求数据接口
interface RequestData {
  model?: string;
  [key: string]: any;
}

const targetUrls: TargetUrlMap = {
  openai: 'https://api.openai.com',
  deepseek: 'https://api.deepseek.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  default: 'https://openrouter.ai/api'
};

// 使用 self 来访问 ServiceWorker 的全局作用域
self.addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request): Promise<Response> {
  // Clone the request to read the body
  const requestClone = request.clone();
  let targetUrl = targetUrls.default;
  let modifiedBody: string | null = null;

  // Only process POST requests with JSON body
  if (request.method === 'POST' && request.headers.get('content-type')?.includes('application/json')) {
    try {
      const data: RequestData = await requestClone.json();
      
      if (data.model) {
        // Extract provider from model (content before the first slash)
        const modelParts = data.model.split('/');
        const provider = modelParts[0].toLowerCase();
        
        // Check if provider exists in targetUrls
        if (provider in targetUrls) {
          targetUrl = targetUrls[provider];
          
          // Remove provider prefix from model
          if (modelParts.length > 1) {
            data.model = modelParts.slice(1).join('/');
          }
          
          // Prepare modified body
          modifiedBody = JSON.stringify(data);
        } else {
          targetUrl = targetUrls.default;
        }
      }
    } catch (error) {
      // If JSON parsing fails, use default URL
      console.error('Error parsing JSON:', error);
    }
  }

  // Construct the URL by combining targetUrl with original path
  const originalUrl = new URL(request.url);
  let pathname = originalUrl.pathname;
  
  // 如果是 Gemini API，移除路径中的 v1/
  if (targetUrl === targetUrls.gemini) {
    pathname = pathname.replace('/v1/', '/');
  }
  
  // 拼接完整URL
  const url = new URL(`${targetUrl}${pathname}${originalUrl.search}`);

  console.log('Proxying request to:', url.toString());

  // Create modified request with potentially updated body
  const modifiedRequest = new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
    body: modifiedBody || request.body,
    redirect: 'follow'
  });
  
  const response = await fetch(modifiedRequest);
  const modifiedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
  
  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
  
  return modifiedResponse;
}