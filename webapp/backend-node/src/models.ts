export interface Message {
  ID_INTERNO: number;
  MESSAGE_DATE: string;
  PORT_CALL_NUMBER: string;
  NUM_CONTENEDORES?: number;
}

export interface LoadEquipmentsRequest {
  id_interno: number;
  port_call_number: string;
  max_registros: number;
}

export interface ProcessPartidasRequest {
  id_interno: number;
  port_call_number: string;
}

export interface Step7Request {
  num_escala: string;
}
