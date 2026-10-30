"""In-memory repositories, for tests and local runs."""


class MemoryRepositories:
    """Holds the in-memory repositories. Built once by the lifespan, so their data lives as
    long as the process. S2 adds the repositories themselves."""
