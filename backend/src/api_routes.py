"""
API routes using clean architecture with injected infrastructure dependencies.
All routes receive their SPARQL repository via the blueprint factory so that
tests can substitute a fake without touching the network.
"""
from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import unquote

from flask import Blueprint, jsonify, request
from rdflib import Graph
from rdflib.exceptions import ParserError

from config import config
from src.domain.services.upload_service import create_upload_service
from src.infrastructure.constants.sparql_queries import SPARQLQueries
from src.infrastructure.external.sparql_repository import SPARQLRepositoryInterface
from src.schemas.responses import HealthResponse, JobStatusResponse

logger = logging.getLogger(__name__)

SUPPORTED_FILE_EXTENSIONS = {"ttl"}
PREFERRED_RDF_FORMATS = {"ttl": ["turtle"]}


# ---------------------------------------------------------------------------
# Helpers shared by multiple routes
# ---------------------------------------------------------------------------

def _get_file_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _parse_uploaded_rdf_file(file_storage) -> Graph:
    filename = file_storage.filename or ""
    extension = _get_file_extension(filename)

    if extension not in SUPPORTED_FILE_EXTENSIONS:
        raise ValueError("Unsupported file type. Allowed format: ttl")

    raw_content = file_storage.read()
    if not raw_content:
        raise ValueError("Uploaded file is empty")

    parse_errors: list[str] = []
    for rdf_format in PREFERRED_RDF_FORMATS.get(extension, []):
        graph = Graph()
        try:
            graph.parse(data=raw_content, format=rdf_format)
            return graph
        except (ParserError, Exception) as exc:
            parse_errors.append(f"{rdf_format}: {exc}")

    raise ValueError(
        "Invalid RDF content for .{} file. Parse errors: {}".format(
            extension, "; ".join(parse_errors)
        )
    )


def _resolve_graph_uri(graph_name: str) -> str:
    """Return a graph URI from request args, the route param, or config defaults."""
    override = request.args.get("graphUri", "").strip()
    if override:
        return unquote(override)
    if graph_name.startswith("http://") or graph_name.startswith("https://"):
        return graph_name
    if not graph_name or graph_name == "default":
        return config.default_graph_uri
    return config.get_graph_uri(graph_name)


def _extract_graph_name(graph_name: str, graph_uri: str) -> str:
    """Return a human-readable graph name, preferring the explicit route segment."""
    if (
        graph_name
        and graph_name != "default"
        and not graph_name.startswith("http://")
        and not graph_name.startswith("https://")
    ):
        return graph_name
    trimmed = graph_uri.rstrip("/")
    return trimmed.split("/")[-1] if trimmed else config.default_graph_name


def _uri_fragment(uri: str) -> str:
    """Extract a readable label from a URI."""
    if "#" in uri:
        return uri.split("#")[-1]
    if "/" in uri:
        return uri.split("/")[-1]
    return uri


# ---------------------------------------------------------------------------
# Blueprint factory
# ---------------------------------------------------------------------------

def create_api_blueprint(sparql_repo: SPARQLRepositoryInterface) -> Blueprint:
    """Create and return the API Blueprint with all routes closed over *sparql_repo*."""

    api_bp = Blueprint("api", __name__, url_prefix="/api")

    # ------------------------------------------------------------------
    # Health / config
    # ------------------------------------------------------------------

    @api_bp.route("/health", methods=["GET"])
    def health_check():
        try:
            response = HealthResponse(
                status="healthy",
                service="Knowledge Graph Viewer Backend",
                virtuoso_url=config.virtuoso_url,
                sparql_endpoint=config.virtuoso_sparql_endpoint,
                external_virtuoso_url=config.external_virtuoso_url,
            )
            return jsonify(response.model_dump())
        except Exception as exc:
            logger.error("Health check failed: %s", exc)
            return jsonify({"error": "Health check failed"}), 500

    @api_bp.route("/config", methods=["GET"])
    def get_config():
        try:
            return jsonify({
                "success": True,
                "config": {
                    **config.to_dict(),
                    "maxUploadSize": "100MB",
                    "supportedFormats": ["ttl"],
                    "virtuosoEndpoint": config.virtuoso_sparql_endpoint,
                },
            })
        except Exception as exc:
            logger.error("Config failed: %s", exc)
            return jsonify({"error": "Config service error"}), 500

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------

    @api_bp.route("/upload", methods=["POST"])
    def upload_file():
        try:
            if "file" not in request.files:
                return jsonify({"error": "No file provided"}), 400

            file = request.files["file"]
            if file.filename == "":
                return jsonify({"error": "No file selected"}), 400

            graph = _parse_uploaded_rdf_file(file)
            graph_name = request.form.get("graphName", "default").strip()
            total_triples = len(graph)

            service = create_upload_service()
            job = service.create_job(file.filename, graph_name, total_triples)

            # Resolve graph URI once so it can be passed to the background thread
            if not graph_name or graph_name.strip() == "" or graph_name == "default":
                graph_uri = config.default_graph_uri
            else:
                graph_uri = config.get_graph_uri(graph_name)

            service.process_file(job.job_id, graph, graph_uri)

            return jsonify({
                "success": True,
                "message": "File upload started",
                "jobId": job.job_id,
                "filename": file.filename,
                "graphName": graph_name,
            })

        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            logger.error("Upload failed: %s", exc)
            return jsonify({"error": "Upload service error"}), 500

    @api_bp.route("/upload/status/<job_id>", methods=["GET"])
    def get_upload_status(job_id: str):
        try:
            service = create_upload_service()
            job = service.get_job(job_id)
            if not job:
                return jsonify({"error": f"Job {job_id} not found"}), 404
            response = JobStatusResponse.from_upload_job(job)
            return jsonify(response.model_dump(by_alias=True))
        except Exception as exc:
            logger.error("Job status failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    @api_bp.route("/upload/analysis_progress/<job_id>", methods=["GET"])
    def get_analysis_progress(job_id: str):
        return jsonify({"progress": 0, "status": "not_started", "message": "Analysis not implemented yet"})

    # ------------------------------------------------------------------
    # Graphs list
    # ------------------------------------------------------------------

    @api_bp.route("/graphs", methods=["GET"])
    def get_graphs():
        try:
            results = sparql_repo.query(SPARQLQueries.get_query("LIST_GRAPHS_WITH_COUNTS"))
            graphs: list[dict] = []

            if results and isinstance(results, list):
                _SYSTEM_PREFIXES = (
                    "http://www.w3.org/",
                    "http://www.openlinksw.com/",
                    "http://localhost:8890/DAV/",
                    "http://localhost:8890/sparql",
                    "urn:activitystreams-owl",
                )
                for binding in results:
                    if "g" not in binding or "triples" not in binding:
                        continue
                    graph_uri = binding["g"]["value"]
                    if any(graph_uri.startswith(p) for p in _SYSTEM_PREFIXES):
                        continue
                    triple_count = int(binding["triples"]["value"])
                    graph_name = (
                        graph_uri.split("graph/")[-1]
                        if "graph/" in graph_uri
                        else (graph_uri.split("/")[-1] or graph_uri)
                    )
                    graphs.append({"name": graph_name, "uri": graph_uri, "tripleCount": triple_count})

            return jsonify({"success": True, "graphs": graphs, "count": len(graphs)})

        except Exception as exc:
            logger.error("Get graphs failed: %s", exc)
            return jsonify({"success": False, "graphs": [], "count": 0, "error": "Service error"})

    # ------------------------------------------------------------------
    # Graph analysis
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>/analysis", methods=["GET"])
    def get_graph_analysis(graph_name: str):
        try:
            graph_uri = _resolve_graph_uri(graph_name)
            resolved_name = _extract_graph_name(graph_name, graph_uri)

            # Triple count
            count_result = sparql_repo.query(
                SPARQLQueries.get_query("COUNT_GRAPH_TRIPLES", graph_uri=graph_uri)
            )
            total_triples = int(count_result[0]["count"]["value"]) if count_result else 0

            # Class / entity-type counts
            class_results = sparql_repo.query(
                SPARQLQueries.get_query("GET_GRAPH_CLASSES_WITH_COUNTS", graph_uri=graph_uri)
            )
            entity_types: list[dict] = []
            for result in (class_results or []):
                class_uri = result["class"]["value"]
                count = int(result["count"]["value"])
                label = (
                    result["classLabel"]["value"]
                    if "classLabel" in result and result["classLabel"]
                    else _uri_fragment(class_uri)
                )
                entity_types.append({"uri": class_uri, "label": label, "instanceCount": count, "data": []})

            tabs = [
                {
                    "label": "Summary",
                    "type": "summary",
                    "content": f"Analysis results for graph: {graph_name}",
                    "uploadInfo": {
                        "status": "success",
                        "message": f"Graph analysis completed for {resolved_name}",
                        "graphId": resolved_name,
                        "graphName": resolved_name,
                        "graphUri": graph_uri,
                        "triplesCount": total_triples,
                        "sparqlEndpoint": config.sparql_endpoint,
                        "analysisResults": {
                            "totalTriples": total_triples,
                            "foundClassesCount": len(entity_types),
                            "classList": entity_types,
                        },
                    },
                },
                {
                    "label": "Search",
                    "type": "search",
                    "content": "SPARQL Search Interface",
                    "uploadInfo": {
                        "graphId": resolved_name,
                        "graphName": resolved_name,
                        "graphUri": graph_uri,
                        "sparqlEndpoint": config.sparql_endpoint,
                    },
                    "data": [],
                },
            ]
            for et in entity_types:
                tabs.append({
                    "label": f"{et['label']} ({et['instanceCount']})",
                    "type": "table",
                    "content": f"Instances of {et['label']}",
                    "data": [],
                    "uploadInfo": {
                        "classUri": et["uri"],
                        "graphName": resolved_name,
                        "graphUri": graph_uri,
                        "sparqlEndpoint": config.sparql_endpoint,
                    },
                })

            return jsonify({
                "success": True,
                "graphName": resolved_name,
                "graphUri": graph_uri,
                "tabs": tabs,
                "analysis": {
                    "totalTriples": total_triples,
                    "entityTypes": len(entity_types),
                    "message": f"Successfully analyzed {total_triples} triples with {len(entity_types)} entity types",
                },
            })
        except Exception as exc:
            logger.error("Graph analysis failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    # ------------------------------------------------------------------
    # Entity instances (paginated)
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>/entities/<path:class_uri>/instances", methods=["GET"])
    def get_entity_instances(graph_name: str, class_uri: str):
        try:
            class_uri = unquote(class_uri)
            graph_uri = _resolve_graph_uri(graph_name)

            page = int(request.args.get("page", 0))
            size = int(request.args.get("size", 10))
            offset = page * size
            search = request.args.get("search", "").strip()

            VIRTUOSO_LIMIT = 10_000
            CANDIDATE_LITERAL_LIMIT = 5_000
            message: Optional[str] = None
            total_count: Optional[int] = None
            use_uri_fragment_short_search = False
            use_capped_literal_search = False
            use_short_label_uri_search = False
            skip_exact_count = False
            sampled_total_count: Optional[int] = None

            # Query strategy for searches on very large classes:
            # 1) Start with fast URI/label search for all terms.
            # 2) Then try rich class-scoped search.
            # 3) If needed, degrade to URI/label search and finally URI-fragment search.
            use_fast_fallback_search = False
            if search:
                use_short_label_uri_search = True

            if search:
                if use_short_label_uri_search:
                    instances_query = SPARQLQueries.get_query(
                        "GET_CLASS_INSTANCES_LABEL_URI_FILTER",
                        graph_uri=graph_uri,
                        class_uri=class_uri,
                        filter_text=search,
                        limit=size,
                        offset=offset,
                    )
                    instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                    if instances_result is None:
                        use_short_label_uri_search = False
                        use_capped_literal_search = True
                        message = "Search was narrowed to capped literal matching for performance on large classes."
                        instances_query = SPARQLQueries.get_query(
                            "GET_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED",
                            graph_uri=graph_uri,
                            class_uri=class_uri,
                            search_term=search,
                            candidate_limit=CANDIDATE_LITERAL_LIMIT,
                            limit=size,
                            offset=offset,
                        )
                        instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                        if instances_result is None:
                            use_capped_literal_search = False
                            use_fast_fallback_search = True
                            message = "Search was narrowed to URI/label matching for performance on large classes."
                            instances_query = SPARQLQueries.get_query(
                                "GET_CLASS_INSTANCES_WITH_FILTER_FAST",
                                graph_uri=graph_uri, class_uri=class_uri,
                                filter_text=search, limit=size, offset=offset,
                            )
                            instances_result = sparql_repo.query(instances_query, timeout_seconds=30)
                            if instances_result is None:
                                use_uri_fragment_short_search = True
                                message = "Search was narrowed to URI-fragment matching for performance on large classes."
                                instances_query = SPARQLQueries.get_query(
                                    "GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                                    graph_uri=graph_uri, class_uri=class_uri,
                                    filter_text=search, limit=size, offset=offset,
                                )
                                instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                elif use_capped_literal_search:
                    instances_query = SPARQLQueries.get_query(
                        "GET_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED",
                        graph_uri=graph_uri,
                        class_uri=class_uri,
                        search_term=search,
                        candidate_limit=CANDIDATE_LITERAL_LIMIT,
                        limit=size,
                        offset=offset,
                    )
                    instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                    if instances_result is None:
                        use_capped_literal_search = False
                        use_fast_fallback_search = True
                        message = "Search was narrowed to URI/label matching for performance on large classes."
                        instances_query = SPARQLQueries.get_query(
                            "GET_CLASS_INSTANCES_WITH_FILTER_FAST",
                            graph_uri=graph_uri, class_uri=class_uri,
                            filter_text=search, limit=size, offset=offset,
                        )
                        instances_result = sparql_repo.query(instances_query, timeout_seconds=30)
                        if instances_result is None:
                            use_uri_fragment_short_search = True
                            message = "Search was narrowed to URI-fragment matching for performance on large classes."
                            instances_query = SPARQLQueries.get_query(
                                "GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                                graph_uri=graph_uri, class_uri=class_uri,
                                filter_text=search, limit=size, offset=offset,
                            )
                            instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                elif use_uri_fragment_short_search:
                    instances_query = SPARQLQueries.get_query(
                        "GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                        graph_uri=graph_uri, class_uri=class_uri,
                        filter_text=search, limit=size, offset=offset,
                    )
                    instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                elif use_fast_fallback_search:
                    instances_query = SPARQLQueries.get_query(
                        "GET_CLASS_INSTANCES_WITH_FILTER_FAST",
                        graph_uri=graph_uri, class_uri=class_uri,
                        filter_text=search, limit=size, offset=offset,
                    )
                    instances_result = sparql_repo.query(instances_query, timeout_seconds=45)
                    if instances_result is None:
                        use_uri_fragment_short_search = True
                        message = "Search was narrowed to URI-fragment matching for performance on large classes."
                        instances_query = SPARQLQueries.get_query(
                            "GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                            graph_uri=graph_uri, class_uri=class_uri,
                            filter_text=search, limit=size, offset=offset,
                        )
                        instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
                else:
                    instances_query = SPARQLQueries.get_query(
                        "SEARCH_ENTITY_TYPE_RESULTS",
                        graph_uri=graph_uri, class_uri=class_uri,
                        search_term=search, limit=size, offset=offset,
                    )
                    instances_result = sparql_repo.query(instances_query, timeout_seconds=45)

                    if instances_result is None:
                        use_fast_fallback_search = True
                        message = "Search was narrowed to URI/label matching for performance on large classes."
                        instances_query = SPARQLQueries.get_query(
                            "GET_CLASS_INSTANCES_WITH_FILTER_FAST",
                            graph_uri=graph_uri, class_uri=class_uri,
                            filter_text=search, limit=size, offset=offset,
                        )
                        instances_result = sparql_repo.query(instances_query, timeout_seconds=45)
                        if instances_result is None:
                            use_uri_fragment_short_search = True
                            message = "Search was narrowed to URI-fragment matching for performance on large classes."
                            instances_query = SPARQLQueries.get_query(
                                "GET_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                                graph_uri=graph_uri, class_uri=class_uri,
                                filter_text=search, limit=size, offset=offset,
                            )
                            instances_result = sparql_repo.query(instances_query, timeout_seconds=20)
            else:
                instances_query = SPARQLQueries.get_query(
                    "GET_CLASS_INSTANCES_PAGINATED",
                    graph_uri=graph_uri, class_uri=class_uri,
                    limit=size, offset=offset,
                )
                instances_result = sparql_repo.query(instances_query)

            if instances_result is None:
                if not search:
                    return jsonify({
                        "success": False,
                        "error": "Entity search timed out. Please narrow your filter term.",
                    }), 504

                # Guaranteed fallback: sample class instances in pages and filter in Python.
                # This avoids expensive CONTAINS scans in Virtuoso while still returning usable matches.
                sample_chunk = 500
                max_scan = 5_000
                needed_matches = (page + 1) * size
                scanned = 0
                lower_search = search.lower()
                sampled_matches: list[dict] = []

                while scanned < max_scan and len(sampled_matches) < needed_matches:
                    sample_query = SPARQLQueries.get_query(
                        "GET_CLASS_INSTANCES_WITH_LABELS_PAGINATED",
                        graph_uri=graph_uri,
                        class_uri=class_uri,
                        limit=sample_chunk,
                        offset=scanned,
                    )
                    sample_results = sparql_repo.query(sample_query, timeout_seconds=20)
                    if sample_results is None:
                        break
                    if not sample_results:
                        break

                    for r in sample_results:
                        instance_uri = r["instance"]["value"]
                        label_val = ""
                        if "label" in r and r["label"]:
                            label_val = r["label"].get("value", "")
                        haystack = f"{instance_uri} {label_val}".lower()
                        if lower_search in haystack:
                            sampled_matches.append({"instance": {"value": instance_uri}, "label": {"value": label_val}})

                    if len(sample_results) < sample_chunk:
                        scanned += len(sample_results)
                        break
                    scanned += sample_chunk

                page_start = offset
                page_end = page_start + size
                instances_result = sampled_matches[page_start:page_end]
                skip_exact_count = True
                sampled_total_count = len(sampled_matches)
                if len(sampled_matches) >= needed_matches and scanned >= max_scan:
                    sampled_total_count += 1
                fallback_note = (
                    f"Search used sampled URI/label fallback over first {scanned} instances for responsiveness."
                )
                if message:
                    message = f"{message} {fallback_note}"
                else:
                    message = fallback_note

            data_rows: list[dict] = []

            for result in (instances_result or []):
                instance_uri = result["instance"]["value"]
                if search and "label" in result and result["label"] and result["label"].get("value"):
                    label = result["label"]["value"]
                else:
                    label = _uri_fragment(instance_uri)
                    if not search:
                        # Attempt to fetch a descriptive label
                        props_result = sparql_repo.query(
                            SPARQLQueries.get_query(
                                "GET_ENTITY_PROPERTIES",
                                graph_uri=graph_uri, entity_uri=instance_uri,
                            )
                        )
                        if props_result:
                            candidate = props_result[0]["value"]["value"]
                            if candidate and candidate.strip():
                                label = candidate.strip()
                data_rows.append({"label": label, "uri": instance_uri})

            # Best-effort count: do not fail the request if exact counting times out.
            count_timed_out = False
            if search:
                if skip_exact_count:
                    count_result = None
                    count_timed_out = True
                    total_count = sampled_total_count if sampled_total_count is not None else (offset + len(data_rows))
                elif use_uri_fragment_short_search:
                    count_query = SPARQLQueries.get_query(
                        "COUNT_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                        graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                    )
                    count_result = sparql_repo.query(count_query, timeout_seconds=20)
                elif use_short_label_uri_search:
                    count_query = SPARQLQueries.get_query(
                        "COUNT_CLASS_INSTANCES_LABEL_URI_FILTER",
                        graph_uri=graph_uri,
                        class_uri=class_uri,
                        filter_text=search,
                    )
                    count_result = sparql_repo.query(count_query, timeout_seconds=20)
                    if count_result is None:
                        use_short_label_uri_search = False
                        use_capped_literal_search = True
                        count_query = SPARQLQueries.get_query(
                            "COUNT_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED",
                            graph_uri=graph_uri,
                            class_uri=class_uri,
                            search_term=search,
                            candidate_limit=CANDIDATE_LITERAL_LIMIT,
                        )
                        count_result = sparql_repo.query(count_query, timeout_seconds=20)
                elif use_capped_literal_search:
                    count_query = SPARQLQueries.get_query(
                        "COUNT_CLASS_INSTANCES_BY_LITERAL_SEARCH_CAPPED",
                        graph_uri=graph_uri,
                        class_uri=class_uri,
                        search_term=search,
                        candidate_limit=CANDIDATE_LITERAL_LIMIT,
                    )
                    count_result = sparql_repo.query(count_query, timeout_seconds=20)
                    if count_result is None:
                        use_fast_fallback_search = True
                        count_query = SPARQLQueries.get_query(
                            "COUNT_CLASS_INSTANCES_WITH_FILTER_FAST",
                            graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                        )
                        count_result = sparql_repo.query(count_query, timeout_seconds=20)
                        if count_result is None:
                            use_uri_fragment_short_search = True
                            count_query = SPARQLQueries.get_query(
                                "COUNT_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                                graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                            )
                            count_result = sparql_repo.query(count_query, timeout_seconds=20)
                elif use_fast_fallback_search:
                    count_query = SPARQLQueries.get_query(
                        "COUNT_CLASS_INSTANCES_WITH_FILTER_FAST",
                        graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                    )
                    count_result = sparql_repo.query(count_query, timeout_seconds=30)
                    if count_result is None:
                        use_uri_fragment_short_search = True
                        count_query = SPARQLQueries.get_query(
                            "COUNT_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                            graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                        )
                        count_result = sparql_repo.query(count_query, timeout_seconds=20)
                else:
                    count_query = SPARQLQueries.get_query(
                        "COUNT_ENTITY_TYPE_SEARCH_RESULTS",
                        graph_uri=graph_uri, class_uri=class_uri, search_term=search,
                    )
                    count_result = sparql_repo.query(count_query, timeout_seconds=30)
                    if count_result is None:
                        use_uri_fragment_short_search = True
                        count_query = SPARQLQueries.get_query(
                            "COUNT_CLASS_INSTANCES_URI_FRAGMENT_FILTER",
                            graph_uri=graph_uri, class_uri=class_uri, filter_text=search,
                        )
                        count_result = sparql_repo.query(count_query, timeout_seconds=20)
            else:
                count_query = SPARQLQueries.get_query(
                    "COUNT_CLASS_INSTANCES_SIMPLE",
                    graph_uri=graph_uri, class_uri=class_uri,
                )
                count_result = sparql_repo.query(count_query)

            if count_result is None:
                count_timed_out = True
                total_count = offset + len(data_rows)
                if len(data_rows) == size:
                    total_count += 1
                if message:
                    message = f"{message} Total count is estimated because exact counting timed out."
                else:
                    message = "Total count is estimated because exact counting timed out."
            else:
                total_count = int(count_result[0]["count"]["value"]) if count_result else 0

            if not count_timed_out and offset >= VIRTUOSO_LIMIT:
                limit_message = "Only first 10000 records are displayed"
                if message:
                    limit_message = f"{message} {limit_message}"
                return jsonify({
                    "success": True, "data": [],
                    "message": limit_message,
                    "totalElements": total_count,
                    "totalPages": (total_count + size - 1) // size,
                    "size": size, "number": page,
                })

            if search and total_count > VIRTUOSO_LIMIT and offset < VIRTUOSO_LIMIT:
                if message:
                    message = f"{message} Only first 10000 records are displayed"
                else:
                    message = "Only first 10000 records are displayed"

            if search and use_capped_literal_search:
                capped_info = (
                    f"Search considers up to {CANDIDATE_LITERAL_LIMIT} literal matches before class filtering."
                )
                if message:
                    message = f"{message} {capped_info}"
                else:
                    message = capped_info

            response_data: dict = {
                "success": True, "data": data_rows,
                "totalElements": total_count,
                "totalPages": (total_count + size - 1) // size,
                "size": size, "number": page,
            }
            if message:
                response_data["message"] = message
            return jsonify(response_data)

        except Exception as exc:
            logger.error("Entity instances query failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>/search", methods=["GET"])
    def search_graph(graph_name: str):
        try:
            search_query = request.args.get("q", "").strip()
            if not search_query:
                return jsonify({"success": False, "error": "No search query provided"}), 400

            graph_uri = _resolve_graph_uri(graph_name)
            resolved_name = _extract_graph_name(graph_name, graph_uri)

            results = sparql_repo.query(
                SPARQLQueries.get_query(
                    "SEARCH_LITERALS",
                    graph_uri=graph_uri, search_term=search_query, limit=100,
                )
            )
            search_results = [
                {
                    "subject": r["subject"]["value"],
                    "predicate": r["predicate"]["value"],
                    "object": r["object"]["value"],
                }
                for r in (results or [])
            ]

            return jsonify({
                "success": True,
                "results": search_results,
                "query": search_query,
                "graphName": resolved_name,
                "graphUri": graph_uri,
                "count": len(search_results),
            })
        except Exception as exc:
            logger.error("Graph search failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    # ------------------------------------------------------------------
    # Entity graph visualisation
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>/entities/<path:entity_uri>/graph", methods=["GET"])
    def get_entity_graph(graph_name: str, entity_uri: str):
        try:
            entity_uri = unquote(entity_uri)
            graph_uri = _resolve_graph_uri(graph_name)
            max_nodes_param = request.args.get("maxNodes", "50")
            if max_nodes_param and max_nodes_param.lower() == "all":
                max_nodes_clause = ""
            else:
                try:
                    max_nodes = int(max_nodes_param)
                except (TypeError, ValueError):
                    return jsonify({"error": "maxNodes must be a positive integer or 'all'"}), 400
                if max_nodes < 1:
                    return jsonify({"error": "maxNodes must be a positive integer or 'all'"}), 400
                max_nodes_clause = f"LIMIT {max_nodes}"
            direction = request.args.get("direction", "both")

            if direction == "outward":
                sparql_q = SPARQLQueries.get_query(
                    "GET_ENTITY_OUTWARD_CONNECTIONS",
                    graph_uri=graph_uri, entity_uri=entity_uri, max_nodes_clause=max_nodes_clause,
                )
            elif direction == "inward":
                sparql_q = SPARQLQueries.get_query(
                    "GET_ENTITY_INWARD_CONNECTIONS",
                    graph_uri=graph_uri, entity_uri=entity_uri, max_nodes_clause=max_nodes_clause,
                )
            else:
                sparql_q = SPARQLQueries.get_query(
                    "GET_ENTITY_BIDIRECTIONAL_CONNECTIONS",
                    graph_uri=graph_uri, entity_uri=entity_uri, max_nodes_clause=max_nodes_clause,
                )

            results = sparql_repo.query(sparql_q)

            def get_entity_label(uri: str) -> str:
                label_result = sparql_repo.query(
                    SPARQLQueries.get_query("GET_ENTITY_LABEL", graph_uri=graph_uri, entity_uri=uri)
                )
                if label_result:
                    return label_result[0]["label"]["value"]
                return _uri_fragment(uri)

            def get_predicate_label(uri: str, sparql_result: Optional[dict] = None) -> str:
                if sparql_result and sparql_result.get("predicateLabel"):
                    return sparql_result["predicateLabel"]["value"]
                return _uri_fragment(uri)

            nodes: list[dict] = []
            edges: list[dict] = []
            node_ids: set[str] = set()

            central_label = get_entity_label(entity_uri)
            nodes.append({"id": entity_uri, "label": central_label, "uri": entity_uri, "isCentral": True})
            node_ids.add(entity_uri)

            for result in (results or []):
                if direction == "outward":
                    pred_uri = result["predicate"]["value"]
                    obj_uri = result["object"]["value"]
                    if obj_uri not in node_ids:
                        nodes.append({"id": obj_uri, "label": get_entity_label(obj_uri), "uri": obj_uri})
                        node_ids.add(obj_uri)
                    edges.append({
                        "id": f"{entity_uri}-{pred_uri}-{obj_uri}",
                        "source": entity_uri, "target": obj_uri,
                        "label": get_predicate_label(pred_uri, result), "uri": pred_uri,
                    })

                elif direction == "inward":
                    subj_uri = result["subject"]["value"]
                    pred_uri = result["predicate"]["value"]
                    if subj_uri not in node_ids:
                        nodes.append({"id": subj_uri, "label": get_entity_label(subj_uri), "uri": subj_uri})
                        node_ids.add(subj_uri)
                    edges.append({
                        "id": f"{subj_uri}-{pred_uri}-{entity_uri}",
                        "source": subj_uri, "target": entity_uri,
                        "label": get_predicate_label(pred_uri, result), "uri": pred_uri,
                    })

                else:  # both
                    if "subject" not in result or "object" not in result:
                        continue
                    subj_uri = result["subject"]["value"]
                    pred_uri = result["predicate"]["value"]
                    obj_uri = result["object"]["value"]
                    if subj_uri == entity_uri:
                        if obj_uri not in node_ids:
                            nodes.append({"id": obj_uri, "label": get_entity_label(obj_uri), "uri": obj_uri})
                            node_ids.add(obj_uri)
                        edges.append({
                            "id": f"{entity_uri}-{pred_uri}-{obj_uri}",
                            "source": entity_uri, "target": obj_uri,
                            "label": get_predicate_label(pred_uri, result), "uri": pred_uri,
                        })
                    else:
                        if subj_uri not in node_ids:
                            nodes.append({"id": subj_uri, "label": get_entity_label(subj_uri), "uri": subj_uri})
                            node_ids.add(subj_uri)
                        edges.append({
                            "id": f"{subj_uri}-{pred_uri}-{entity_uri}",
                            "source": subj_uri, "target": entity_uri,
                            "label": get_predicate_label(pred_uri, result), "uri": pred_uri,
                        })

            return jsonify({"nodes": nodes, "edges": edges, "centralNode": entity_uri})

        except Exception as exc:
            logger.error("Entity graph query failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    # ------------------------------------------------------------------
    # Entity literals
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>/entities/<path:entity_uri>/literals", methods=["GET"])
    def get_entity_literals(graph_name: str, entity_uri: str):
        try:
            entity_uri = unquote(entity_uri)
            graph_uri = _resolve_graph_uri(graph_name)

            results = sparql_repo.query(
                SPARQLQueries.get_query("GET_ENTITY_LITERALS", graph_uri=graph_uri, entity_uri=entity_uri)
            )
            literals = []
            for result in (results or []):
                pred_uri = result["predicate"]["value"]
                pred_label = (
                    result["predicateLabel"]["value"]
                    if result.get("predicateLabel")
                    else _uri_fragment(pred_uri)
                )
                literals.append({
                    "predicate": pred_uri,
                    "predicateLabel": pred_label,
                    "value": result["value"]["value"],
                })
            return jsonify(literals)

        except Exception as exc:
            logger.error("Entity literals query failed: %s", exc)
            return jsonify({"error": "Service error"}), 500

    # ------------------------------------------------------------------
    # Graph deletion
    # ------------------------------------------------------------------

    @api_bp.route("/graphs/<path:graph_name>", methods=["DELETE"])
    def delete_graph(graph_name: str):
        try:
            graph_uri = _resolve_graph_uri(graph_name)

            def _get_remaining() -> int:
                result = sparql_repo.query(
                    SPARQLQueries.get_query("COUNT_GRAPH_TRIPLES", graph_uri=graph_uri),
                    timeout_seconds=60,
                )
                if result is None:
                    raise RuntimeError("Failed to query graph triple count")
                return int(result[0]["count"]["value"]) if result else 0

            total_triples = _get_remaining()
            logger.info("Deleting graph %s (%d triples)", graph_uri, total_triples)

            if total_triples < 50_000:
                sparql_repo.execute_update(
                    SPARQLQueries.get_query("DELETE_GRAPH", graph_uri=graph_uri),
                    timeout_seconds=120,
                )
            else:
                deleted_batches = 0
                previous_remaining = total_triples
                stalled = 0
                while True:
                    sparql_repo.execute_update(
                        SPARQLQueries.get_query("DELETE_GRAPH_BATCH", graph_uri=graph_uri, batch_size=10_000),
                        timeout_seconds=120,
                    )
                    deleted_batches += 1
                    remaining = _get_remaining()
                    logger.info("Batch %d done; %d triples remaining", deleted_batches, remaining)
                    if remaining >= previous_remaining:
                        stalled += 1
                    else:
                        stalled = 0
                    previous_remaining = remaining
                    if stalled >= 3:
                        raise RuntimeError(
                            f"Deletion stalled at {remaining} triples for graph {graph_uri}"
                        )
                    if remaining == 0:
                        break
                    if deleted_batches > 1_000:
                        raise RuntimeError(f"Deletion stopped after {deleted_batches} batches")
                try:
                    sparql_repo.execute_update(
                        SPARQLQueries.get_query("DELETE_GRAPH", graph_uri=graph_uri),
                        timeout_seconds=60,
                    )
                except Exception as exc:
                    logger.warning("Failed to clean up graph metadata: %s", exc)

            remaining_after = _get_remaining()
            if remaining_after > 0:
                logger.error("Deletion incomplete for %s: %d triples remain", graph_uri, remaining_after)
                return jsonify({
                    "success": False,
                    "message": f"Deletion incomplete. {remaining_after} triples still remain.",
                }), 500

            logger.info("Successfully deleted graph %s", graph_uri)
            return jsonify({
                "success": True,
                "message": f"Graph '{graph_name}' deleted successfully ({total_triples} triples removed)",
            })

        except Exception as exc:
            logger.error("Delete graph failed: %s", exc)
            return jsonify({"success": False, "message": "Service error"}), 500

    @api_bp.app_errorhandler(429)
    def rate_limit_handler(e):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    @api_bp.app_errorhandler(500)
    def internal_error_handler(e):
        logger.error("Unhandled server error: %s", e)
        return jsonify({"error": "Internal server error"}), 500

    return api_bp


# ---------------------------------------------------------------------------
# App-level registration helper — called from app.py
# ---------------------------------------------------------------------------

def register_api_routes(app) -> None:
    """Wire up the blueprint with real infrastructure dependencies."""
    from src.infrastructure.external.sparql_repository import VirtuosoSPARQLRepository

    sparql_repo = VirtuosoSPARQLRepository(
        sparql_endpoint=config.virtuoso_sparql_endpoint,
        sparql_auth_endpoint=f"{config.virtuoso_url}/sparql-auth",
        username=config.virtuoso_user,
        password=config.virtuoso_password,
    )
    app.register_blueprint(create_api_blueprint(sparql_repo))
