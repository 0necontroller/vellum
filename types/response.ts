export interface IServerResponse {
  status: "success" | "error";
  message: string;
  data: any;
}
