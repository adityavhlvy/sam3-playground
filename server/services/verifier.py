from abc import ABC, abstractmethod
import os
from typing import Dict, Any


class BaseVerifier(ABC):
    @abstractmethod
    def verify_mask(
        self, image_path: str, prompt: str, mask_data: Any
    ) -> Dict[str, Any]:
        """
        Returns:
            {
                "decision": "accept" | "reject" | "flag",
                "confidence": float,
                "reason": str
            }
        """
        pass


class LocalVerifier(BaseVerifier):
    def __init__(self):
        print("Initializing Local Verifier (Llama 3.2 placeholder)...")
        # In future, load model here

    def verify_mask(
        self, image_path: str, prompt: str, mask_data: Any
    ) -> Dict[str, Any]:
        # Placeholder logic
        return {
            "decision": "accept",
            "confidence": 0.85,
            "reason": "Local model (mock) accepted this.",
        }


class ExternalVerifier(BaseVerifier):
    def __init__(self, provider="openai"):
        self.provider = provider
        self.api_key = os.getenv("VERIFIER_API_KEY")
        print(f"Initializing External Verifier ({provider})...")

    def verify_mask(
        self, image_path: str, prompt: str, mask_data: Any
    ) -> Dict[str, Any]:
        # Placeholder for API call
        return {
            "decision": "flag",
            "confidence": 0.6,
            "reason": f"External API ({self.provider}) flagged this for review.",
        }


def get_verifier() -> BaseVerifier:
    provider = os.getenv("VERIFIER_PROVIDER", "local").lower()
    if provider == "local":
        return LocalVerifier()
    else:
        return ExternalVerifier(provider=provider)
