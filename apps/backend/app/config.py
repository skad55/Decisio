from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    APP_NAME: str = "Decisio"
    APP_ENV: str = "local"
    DATABASE_URL: str
    JWT_SECRET: str
    CORS_ORIGINS: str = "http://localhost:3000"

    def cors_list(self):
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

settings = Settings()
