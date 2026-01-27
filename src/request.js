import axios from 'axios';
// 不使用这个可以直接正常请求
// import axiosTauriApiAdapter from 'axios-tauri-api-adapter';
export default axios.create({
    // adapter: axiosTauriApiAdapter,
});
