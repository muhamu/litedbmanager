use keyring::Entry;

const SERVICE_NAME: &str = "com.litedb.manager";

pub fn set_password(profile_id: &str, password: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, profile_id).map_err(|e| e.to_string())?;
    entry.set_password(password).map_err(|e| e.to_string())
}

pub fn get_password(profile_id: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, profile_id).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

pub fn delete_password(profile_id: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, profile_id).map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}
