export interface Profile {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'active' | 'rejected';
  mode: 'dual' | 'multi';
  can_modify: boolean;
  can_delete: boolean;
  created_at: string;
}

export interface SignupRequest {
  id: string;
  username: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface MasterDataFile {
  id: string;
  type: 'warning' | 'realised';
  year: number;
  month: number;
  day: number;
  lead_day: string | null;
  districts: Record<string, number | null>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserDataFile {
  id: string;
  master_file_id: string | null;
  user_id: string;
  type: 'warning' | 'realised';
  year: number;
  month: number;
  day: number;
  lead_day: string | null;
  districts: Record<string, number | null>;
  created_at: string;
  updated_at: string;
}

export interface RainfallConfigRecord {
  id: string;
  config: Record<string, unknown>;
  updated_at: string;
}
