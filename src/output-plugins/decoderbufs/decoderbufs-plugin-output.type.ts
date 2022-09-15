export enum ProtocolBuffersOperation {
  UNKNOWN = -1,
  INSERT = 0,
  UPDATE = 1,
  DELETE = 2,
  BEGIN = 3,
  COMMIT = 4,
}
export declare module ProtocolBuffers {
  export interface Point {
    x: number;
    y: number;
  }

  export interface DatumMessage {
    column_name: string;
    column_type: any;

    datum_int32?: number;
    datum_int64?: number;
    datum_float?: number;
    datum_double?: number;
    datum_bool?: boolean;
    datum_string?: string;
    datum_bytes?: string;
    datum_point?: Point;
    datum_missing?: boolean;
  }

  export interface TypeInfo {
    modifier: string;
    value_optional: boolean;
  }

  export interface RowMessage {
    transaction_id?: number;
    commit_time?: number;
    table?: string;
    op?: ProtocolBuffersOperation;
    new_tuple: DatumMessage[];
    old_tuple: DatumMessage[];
    new_typeinfo: TypeInfo[];
  }
}
