// app-config.json do zmp sinh ra, chỉ có ở worktree từng quán (cố ý vắng ở source lõi).
// Khai báo wildcard chỉ có tác dụng khi file thật KHÔNG tồn tại; có file thật thì TS dùng file thật.
declare module "*app-config.json" {
  const value: Record<string, any>;
  export default value;
}
